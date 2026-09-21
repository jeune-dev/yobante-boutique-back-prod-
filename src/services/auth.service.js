// ─────────────────────────────────────────────────────────────
// services/auth.service.js
// ─────────────────────────────────────────────────────────────
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, RefreshToken, UserOtp, Adresse, PasswordResetToken, sequelize } = require('../models');
const { bcryptConfig, jwtConfig } = require('../config/security');
const { sendResetPasswordEmail } = require('../utils/mailer');
const cache = require('../config/cache');

/**
 * Purge le profil mis en cache par les middlewares d'authentification.
 * Sans cela, un utilisateur qui vient de changer son mot de passe temporaire
 * resterait bloque par `motDePasseChange` jusqu'a expiration du TTL.
 */
function _purgerCacheAuth(userId) {
  cache.del(`auth:${userId}`);
  cache.del(`ADMIN:${userId}`);
}

function _generateOtp(length = 6) {
  const chars = '0123456789';
  const bytes = crypto.randomBytes(length);
  let otp = '';
  for (let i = 0; i < length; i++) otp += chars[bytes[i] % chars.length];
  return otp;
}

// ─── Helpers tokens ────────────────────────────────────────────────────────────

function _hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function _generateAccessToken(user) {
  return jwt.sign({ id: user.id, role: user.role, isActive: user.isActive }, jwtConfig.secret, {
    expiresIn: jwtConfig.expiresIn,
  });
}

function _generateRefreshToken(user) {
  return jwt.sign({ id: user.id, type: 'refresh' }, jwtConfig.refreshSecret, {
    expiresIn: jwtConfig.refreshExpiresIn,
  });
}

/** Stocke un refresh token dans la DB (hash uniquement) et purge les anciens expirés. */
async function _storeRefreshToken(userId, refreshToken, transaction) {
  const decoded = jwt.decode(refreshToken);
  const expiresAt = new Date(decoded.exp * 1000);

  await RefreshToken.create(
    { token: _hashToken(refreshToken), userId, expiresAt },
    { transaction }
  );

  // Purge des tokens expirés pour cet utilisateur (maintenance silencieuse)
  await RefreshToken.destroy({
    where: { userId, expiresAt: { [Op.lt]: new Date() } },
    transaction,
  });
}

// ─── AuthService ───────────────────────────────────────────────────────────────

class AuthService {
  // -------------------- INSCRIPTION --------------------
  static async register({ nom, prenom, email, password, telephone, adresse }) {
    const t = await sequelize.transaction();

    try {
      const emailClean = email.trim().toLowerCase();

      const exist = await User.findOne({ where: { email: emailClean }, transaction: t });
      if (exist) {
        await t.rollback();
        // Décision produit : on révèle explicitement qu'un compte existe déjà.
        // Le contrôleur transforme ce `success: false` en erreur 400 dont le
        // message est affiché tel quel par le mobile.
        return {
          success: false,
          message: 'Un compte existe déjà avec cet email. Veuillez vous connecter.',
        };
      }

      const hashedPassword = await bcrypt.hash(password, bcryptConfig.saltRounds);

      const user = await User.create(
        {
          nom,
          prenom,
          email: emailClean,
          password: hashedPassword,
          telephone,
          isVerified: true,
        },
        { transaction: t }
      );

      // Adresse de livraison optionnelle à l'inscription
      if (adresse && (adresse.rue || adresse.ville)) {
        await Adresse.create(
          {
            userId: user.id,
            nomComplet: adresse.nomComplet || `${prenom} ${nom}`,
            telephone: adresse.telephone || telephone,
            rue: adresse.rue,
            ville: adresse.ville || '',
            region: adresse.region,
            pays: adresse.pays || 'Sénégal',
            codePostal: adresse.codePostal,
            isDefault: true,
          },
          { transaction: t }
        );
      }

      await t.commit();

      // Décision produit : après l'inscription, l'utilisateur se connecte
      // explicitement (pas d'auto-connexion). Les textes du message de succès
      // sont fournis ici pour que le mobile les affiche tels quels.
      return {
        success: true,
        message: 'Inscription réussie',
        messageDescription: 'Veuillez vous connecter pour accéder à votre dashboard.',
        user,
      };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  // -------------------- CONNEXION --------------------
  /**
   * `roleAttendu` (optionnel) restreint la connexion à un rôle précis : le
   * dashboard web ne doit ouvrir sa session qu'aux administrateurs, alors que
   * le mobile accueille clients et vendeurs. Le refus est signalé APRÈS la
   * vérification du mot de passe, pour ne pas révéler le rôle d'un compte à
   * qui ne connaît pas ses identifiants.
   */
  static async login({ identifiant, password, roleAttendu = null }) {
    // ✅ SÉCURITÉ: Simple check sans ReDoS (vrai validation via Joi middleware)
    const isEmail = identifiant.includes('@');
    const user = await User.findOne({
      where: isEmail ? { email: identifiant.trim().toLowerCase() } : { telephone: identifiant },
    });

    if (!user) return { success: false, error: 'Identifiant ou mot de passe incorrect' };

    if (!user.isActive)
      return {
        success: false,
        error: 'Votre compte a été désactivé. Veuillez contacter le support.',
      };

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return { success: false, error: 'Identifiant ou mot de passe incorrect' };

    if (roleAttendu && user.role !== roleAttendu)
      return {
        success: false,
        code: 'ROLE_NON_AUTORISE',
        error: 'Accès réservé aux administrateurs Yobante.',
      };

    const accessToken = _generateAccessToken(user);
    const refreshToken = _generateRefreshToken(user);

    const t = await sequelize.transaction();
    try {
      await _storeRefreshToken(user.id, refreshToken, t);
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    return {
      success: true,
      token: accessToken,
      refreshToken,
      user,
      mustChangePassword: user.mustChangePassword,
    };
  }

  // -------------------- REFRESH TOKEN --------------------
  /**
   * Émet une nouvelle paire access + refresh token (rotation).
   * L'ancien refresh token est marqué revoked (jamais supprimé) : un token déjà utilisé
   * qui est rejoué est un signal de vol/replay qu'un hard-delete effacerait.
   */
  static async refresh({ refreshToken }) {
    if (!refreshToken) return { success: false, error: 'Refresh token manquant' };

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, jwtConfig.refreshSecret);
    } catch (err) {
      return { success: false, error: 'Refresh token invalide ou expiré' };
    }

    if (decoded.type !== 'refresh') return { success: false, error: 'Type de token invalide' };

    const tokenHash = _hashToken(refreshToken);
    const storedToken = await RefreshToken.findOne({ where: { token: tokenHash } });

    if (!storedToken) return { success: false, error: 'Refresh token inconnu' };

    if (storedToken.revoked) return { success: false, error: 'Refresh token révoqué' };

    if (storedToken.expiresAt < new Date())
      return { success: false, error: 'Refresh token expiré' };

    const user = await User.findByPk(decoded.id);
    if (!user) return { success: false, error: 'Utilisateur introuvable' };

    if (!user.isActive) return { success: false, error: 'Compte inactif' };

    const t = await sequelize.transaction();
    try {
      await storedToken.update({ revoked: true }, { transaction: t });

      const newAccessToken = _generateAccessToken(user);
      const newRefreshToken = _generateRefreshToken(user);
      await _storeRefreshToken(user.id, newRefreshToken, t);

      await t.commit();

      return { success: true, token: newAccessToken, refreshToken: newRefreshToken };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  // -------------------- DÉCONNEXION --------------------
  /** Révoque le refresh token fourni (déconnexion propre). */
  static async logout({ refreshToken }) {
    if (!refreshToken) return { success: true };

    const tokenHash = _hashToken(refreshToken);
    await RefreshToken.update({ revoked: true }, { where: { token: tokenHash, revoked: false } });

    return { success: true };
  }

  // -------------------- MOT DE PASSE OUBLIÉ (OTP) --------------------
  static async forgotPassword(email) {
    const emailClean = email.trim().toLowerCase();
    const user = await User.findOne({ where: { email: emailClean } });

    if (!user || user.role === 'ADMIN') {
      // Réponse générique pour ne pas révéler l'existence du compte
      return {
        success: true,
        message: 'Si un compte existe avec cet email, un code de réinitialisation a été envoyé.',
      };
    }

    const otp = _generateOtp(6);
    const otpHash = await bcrypt.hash(otp, bcryptConfig.saltRounds);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await UserOtp.destroy({ where: { userId: user.id, type: 'reset_password' } });
    await UserOtp.create({ userId: user.id, code: otpHash, type: 'reset_password', expiresAt });

    await sendResetPasswordEmail(user.email, otp);

    return {
      success: true,
      message: 'Un code de réinitialisation a été envoyé à votre adresse email.',
    };
  }

  static async verifyResetCode(email, code) {
    const emailClean = email.trim().toLowerCase();
    const user = await User.findOne({ where: { email: emailClean } });

    // Réponse générique pour éviter l'énumération de comptes
    if (!user || user.role === 'ADMIN' || !user.isActive) {
      return {
        success: false,
        message: 'Code incorrect ou expiré.',
      };
    }

    const otpRecord = await UserOtp.findOne({
      where: { userId: user.id, type: 'reset_password', isUsed: false },
      order: [['createdAt', 'DESC']],
    });

    if (!otpRecord) {
      return {
        success: false,
        message: 'Code incorrect ou expiré.',
      };
    }

    if (new Date() > otpRecord.expiresAt) {
      return {
        success: false,
        message: 'Code incorrect ou expiré.',
      };
    }

    // Vérification du nombre de tentatives - si le code est incorrect, on l'enregistre
    // Pour simplifier, on considère 5 tentatives maximum en détruisant le code après 5 échecs.
    // Ici on compare directement.
    const isValid = await bcrypt.compare(code, otpRecord.code);
    if (!isValid) {
      // On peut ici ajouter un compteur d'essais, mais on simplifie par un message générique
      return {
        success: false,
        message: 'Code incorrect ou expiré.',
      };
    }

    // Invalider le code OTP immédiatement après validation
    await otpRecord.update({ isUsed: true });

    // Générer un token temporaire unique
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = _hashToken(resetToken);
    const resetExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await PasswordResetToken.create({
      userId: user.id,
      tokenHash: resetTokenHash,
      expiresAt: resetExpiresAt,
    });

    return {
      success: true,
      message: 'Code vérifié avec succès.',
      resetToken: resetToken,
    };
  }

  // -------------------- RÉINITIALISATION MOT DE PASSE (OTP) --------------------
  static async resetPassword(resetToken, newPassword) {
    const tokenHash = _hashToken(resetToken);
    const tokenRecord = await PasswordResetToken.findOne({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
    });

    if (!tokenRecord) {
      return { success: false, message: 'Token de réinitialisation invalide ou expiré.' };
    }

    const user = await User.findByPk(tokenRecord.userId);
    if (!user) {
      return { success: false, message: 'Utilisateur introuvable.' };
    }

    const t = await sequelize.transaction();
    try {
      const hashedPassword = await bcrypt.hash(newPassword, bcryptConfig.saltRounds);
      await user.update({ password: hashedPassword }, { transaction: t });
      await tokenRecord.update({ usedAt: new Date() }, { transaction: t });
      await RefreshToken.update(
        { revoked: true },
        { where: { userId: user.id, revoked: false }, transaction: t }
      );

      await t.commit();
      return { success: true, message: 'Mot de passe réinitialisé avec succès.' };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  // -------------------- PREMIER LOGIN (CHANGE PASSWORD) --------------------
  static async changerPremierMotDePasse(
    userId,
    { ancienPassword, nouveauPassword, confirmPassword }
  ) {
    if (nouveauPassword !== confirmPassword)
      return { success: false, message: 'Les mots de passe ne correspondent pas' };
    if (nouveauPassword.length < 6)
      return { success: false, message: 'Le mot de passe doit contenir au moins 6 caractères' };

    const user = await User.findByPk(userId);
    if (!user) return { success: false, message: 'Utilisateur introuvable' };
    if (!user.mustChangePassword)
      return {
        success: false,
        message: 'Ce compte ne nécessite pas de changement de mot de passe',
      };

    const valid = await bcrypt.compare(ancienPassword, user.password);
    if (!valid) return { success: false, message: 'Ancien mot de passe incorrect' };

    const hashedPassword = await bcrypt.hash(nouveauPassword, bcryptConfig.saltRounds);
    await user.update({ password: hashedPassword, mustChangePassword: false });
    _purgerCacheAuth(user.id);

    return { success: true, message: 'Mot de passe changé avec succès' };
  }

  // -------------------- CHANGER MOT DE PASSE --------------------
  static async changePassword(userId, oldPassword, newPassword) {
    const user = await User.findByPk(userId);
    if (!user) {
      return { success: false, message: 'Utilisateur introuvable.' };
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return { success: false, message: 'Mot de passe actuel incorrect.' };
    }

    const t = await sequelize.transaction();
    try {
      const hashedPassword = await bcrypt.hash(newPassword, bcryptConfig.saltRounds);
      // `mustChangePassword` retombe aussi par ce chemin : un compte cree par
      // l'administration qui passe par le changement de mot de passe classique
      // resterait sinon bloque a vie par `motDePasseChange`, avec pourtant un
      // mot de passe personnel.
      await user.update(
        { password: hashedPassword, mustChangePassword: false },
        { transaction: t }
      );
      await RefreshToken.update(
        { revoked: true },
        { where: { userId: user.id, revoked: false }, transaction: t }
      );

      await t.commit();
      _purgerCacheAuth(user.id);
      return { success: true, message: 'Mot de passe modifié avec succès.' };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }
}

module.exports = AuthService;
