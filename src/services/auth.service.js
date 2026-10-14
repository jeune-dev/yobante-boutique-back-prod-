// ─────────────────────────────────────────────────────────────
// services/auth.service.js
// ─────────────────────────────────────────────────────────────
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const {
  User,
  RefreshToken,
  UserOtp,
  Adresse,
  PasswordResetToken,
  sequelize,
} = require('../models');
const { bcryptConfig, jwtConfig } = require('../config/security');
const { sendResetPasswordEmail, sendVerificationEmail } = require('../utils/mailer');
const logger = require('../utils/logger');
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

/** Durée de validité du code de confirmation de l'adresse email. */
const DUREE_CODE_VERIFICATION_MIN = 15;

/** Repère renvoyé au mobile quand un client tente de se connecter sans avoir confirmé son email. */
const CODE_EMAIL_NON_VERIFIE = 'EMAIL_NON_VERIFIE';

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
          // L'adresse email doit être confirmée par le code envoyé ci-dessous
          // avant la première connexion.
          isVerified: false,
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
            // Adresse de livraison par défaut, sauf si le client a décoché
            // « Utiliser comme adresse de livraison ».
            isDefault: adresse.isDefault !== false,
          },
          { transaction: t }
        );
      }

      await t.commit();

      // Code de confirmation envoyé APRÈS le commit : le compte existe même si
      // l'envoi échoue, et le client peut redemander un code depuis l'app.
      await AuthService.envoyerCodeVerification(user);

      // Pas de session ouverte ici : le client saisit d'abord le code reçu
      // par email (POST /auth/verify-email), puis se connecte.
      return {
        success: true,
        message: 'Compte créé',
        messageDescription: `Un code de confirmation à 6 chiffres a été envoyé à ${emailClean}.`,
        verificationRequise: true,
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
        // Un vendeur qui tente le dashboard est guidé vers l'application.
        error:
          user.role === 'VENDEUR'
            ? "Votre espace vendeur est disponible dans l'application mobile Yobante Boutique. Connectez-vous depuis l'application avec ces mêmes identifiants."
            : 'Accès réservé aux administrateurs Yobante.',
      };

    // Client inscrit depuis l'application dont l'email n'est pas confirmé :
    // pas de session tant que le code reçu par email n'a pas été saisi.
    // Vérifié après le mot de passe pour ne rien révéler à un inconnu.
    if (!user.isVerified && user.role === 'CLIENT')
      return {
        success: false,
        code: CODE_EMAIL_NON_VERIFIE,
        email: user.email,
        error: "Votre adresse email n'est pas encore confirmée. Saisissez le code reçu par email.",
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

  // -------------------- CONFIRMATION DE L'EMAIL (OTP) --------------------
  /**
   * Génère un nouveau code à 6 chiffres (les précédents sont invalidés) et
   * l'envoie par email. Seul le hachage du code est conservé en base.
   * Ne lève jamais : un échec d'envoi est journalisé, le client pourra
   * redemander un code.
   */
  static async envoyerCodeVerification(user) {
    try {
      const code = _generateOtp(6);
      const codeHash = await bcrypt.hash(code, bcryptConfig.saltRounds);
      const expiresAt = new Date(Date.now() + DUREE_CODE_VERIFICATION_MIN * 60 * 1000);

      await UserOtp.destroy({ where: { userId: user.id, type: 'email_verification' } });
      await UserOtp.create({
        userId: user.id,
        code: codeHash,
        type: 'email_verification',
        expiresAt,
      });

      await sendVerificationEmail(user.email, {
        prenom: user.prenom,
        code,
        minutes: DUREE_CODE_VERIFICATION_MIN,
      });
      return true;
    } catch (err) {
      logger.error('[auth] Envoi du code de confirmation impossible', {
        userId: user.id,
        error: err.message,
      });
      return false;
    }
  }

  /** Vérifie le code saisi et confirme l'adresse email du compte. */
  static async verifyEmail(email, code) {
    const emailClean = email.trim().toLowerCase();
    const user = await User.findOne({ where: { email: emailClean } });
    const echec = { success: false, message: 'Code incorrect ou expiré.' };

    if (!user || !user.isActive) return echec;

    // Déjà confirmé (double appui, lien rejoué) : rien à refaire.
    if (user.isVerified) {
      return {
        success: true,
        message: 'Adresse email déjà confirmée. Vous pouvez vous connecter.',
      };
    }

    const otpRecord = await UserOtp.findOne({
      where: { userId: user.id, type: 'email_verification', isUsed: false },
      order: [['createdAt', 'DESC']],
    });
    if (!otpRecord || new Date() > otpRecord.expiresAt) return echec;

    const valide = await bcrypt.compare(String(code).trim(), otpRecord.code);
    if (!valide) return echec;

    const t = await sequelize.transaction();
    try {
      await otpRecord.update({ isUsed: true }, { transaction: t });
      await user.update({ isVerified: true }, { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
    _purgerCacheAuth(user.id);

    return { success: true, message: 'Adresse email confirmée. Bienvenue sur Yobante Boutique !' };
  }

  /**
   * Renvoie un code de confirmation. Réponse identique que le compte existe
   * ou non, pour ne pas révéler les adresses inscrites.
   */
  static async resendVerification(email) {
    const emailClean = email.trim().toLowerCase();
    const user = await User.findOne({ where: { email: emailClean } });

    if (user && user.isActive && !user.isVerified && user.role === 'CLIENT') {
      await AuthService.envoyerCodeVerification(user);
    }

    return {
      success: true,
      message: 'Si un compte en attente de confirmation existe, un nouveau code a été envoyé.',
    };
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

    // Le code a été reçu sur cette adresse : elle est donc confirmée (utile à
    // un client qui a perdu son code d'inscription et réinitialise son mot de passe).
    if (!user.isVerified) await user.update({ isVerified: true });

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

    const t = await sequelize.transaction();
    try {
      const hashedPassword = await bcrypt.hash(nouveauPassword, bcryptConfig.saltRounds);
      await user.update(
        { password: hashedPassword, mustChangePassword: false },
        { transaction: t }
      );
      // Révocation des sessions ouvertes, comme le fait `changePassword`.
      // Ce chemin-ci ne le faisait pas, et c'est précisément celui où le
      // risque est le plus élevé : le mot de passe temporaire a été
      // communiqué hors bande (e-mail, message) par l'administration, donc
      // potentiellement lu par un tiers. Si ce tiers s'était connecté avant
      // le titulaire, son refresh token restait valide 7 jours APRÈS le
      // changement de mot de passe — le changement ne reprenait pas la main
      // sur le compte.
      await RefreshToken.update(
        { revoked: true },
        { where: { userId: user.id, revoked: false }, transaction: t }
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

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

AuthService.CODE_EMAIL_NON_VERIFIE = CODE_EMAIL_NON_VERIFIE;

module.exports = AuthService;
