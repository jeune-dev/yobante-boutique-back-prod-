// ─────────────────────────────────────────────────────────────
// services/admin/admin.service.js — Gestion des comptes administrateurs
//
// Même circuit que les vendeurs : l'administrateur est créé actif, avec un
// mot de passe temporaire généré ici et envoyé par email, qu'il doit changer
// à sa première connexion (`mustChangePassword`). Le seul état qui varie
// ensuite est actif / bloqué.
// ─────────────────────────────────────────────────────────────
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, RefreshToken, sequelize } = require('../../models');
const { bcryptConfig } = require('../../config/security');
const { ROLES, STATUT_VENDEUR } = require('../../constants');
const paginate = require('../../utils/paginate');
const logger = require('../../config/logger');
const cache = require('../../config/cache');
const { genererMotDePasse } = require('../../utils/security');
const { sendEmail } = require('../resend.service');
const adminAccesTemplate = require('../../templates/mail/adminAcces.template');

// Mêmes libellés que pour les vendeurs : l'interface partage ses composants.
const STATUT = STATUT_VENDEUR;

// Lien vers le dashboard d'administration — distinct de FRONTEND_URL, qui
// pointe vers l'espace des vendeurs.
const lienConnexion = () => process.env.ADMIN_URL || 'https://admin.yobanterek.com';

/** Purge le cache d'authentification : le changement est vu à la requête suivante. */
const invaliderCacheAuth = (userId) => {
  cache.del(`auth:${userId}`);
  cache.del(`${ROLES.ADMIN}:${userId}`);
};

/** Vue « administrateur » renvoyée à l'interface — jamais le hash du mot de passe. */
const presenter = (user) => {
  if (!user) return null;
  const brut = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
  return {
    id: brut.id,
    nom: brut.nom,
    prenom: brut.prenom,
    email: brut.email,
    telephone: brut.telephone,
    role: brut.role,
    isActive: brut.isActive,
    statut: brut.isActive ? STATUT.ACTIF : STATUT.BLOQUE,
    isBlocked: !brut.isActive,
    // Vrai tant que l'administrateur ne s'est pas encore connecté pour
    // remplacer son mot de passe temporaire.
    mustChangePassword: Boolean(brut.mustChangePassword),
    createdAt: brut.createdAt,
  };
};

const ATTRIBUTS = [
  'id',
  'nom',
  'prenom',
  'email',
  'telephone',
  'role',
  'isActive',
  'mustChangePassword',
  'createdAt',
];

async function envoyerAcces({ nom, prenom, email }, motDePasseTemporaire, sujet) {
  const envoi = await sendEmail({
    to: email,
    subject: sujet,
    html: adminAccesTemplate({
      nom,
      prenom,
      email,
      motDePasseTemporaire,
      lienConnexion: lienConnexion(),
    }),
  });
  if (!envoi.success) {
    logger.error('[Admin] Email des accès non envoyé', { email, error: envoi.error });
  }
  return envoi.success;
}

class GestionAdminService {
  static async listerAdmins({ page, limit, search, statut } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);

    const where = { role: ROLES.ADMIN };
    if (search) {
      where[Op.or] = [
        { nom: { [Op.iLike]: `%${search}%` } },
        { prenom: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (statut === STATUT.ACTIF) where.isActive = true;
    else if (statut === STATUT.BLOQUE) where.isActive = false;

    const { count, rows } = await User.findAndCountAll({
      attributes: ATTRIBUTS,
      where,
      order: [['createdAt', 'DESC']],
      limit: l,
      offset,
    });

    return {
      message: 'Liste des administrateurs',
      admins: rows.map(presenter),
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async getAdmin(id) {
    const admin = await User.findOne({ where: { id, role: ROLES.ADMIN }, attributes: ATTRIBUTS });
    if (!admin) return { success: false, message: 'Administrateur introuvable' };
    return { success: true, admin: presenter(admin) };
  }

  /**
   * Aucun mot de passe n'est accepté depuis l'interface : il est généré ici
   * puis envoyé par email, et devra être remplacé à la première connexion.
   */
  static async ajouterAdmin({ nom, prenom, email, telephone }) {
    const emailClean = email.trim().toLowerCase();
    const motDePasseTemporaire = genererMotDePasse();

    const t = await sequelize.transaction();
    let admin;
    try {
      const exist = await User.findOne({ where: { email: emailClean }, transaction: t });
      if (exist) {
        await t.rollback();
        return { success: false, message: 'Cet email est déjà utilisé' };
      }

      const hashedPassword = await bcrypt.hash(motDePasseTemporaire, bcryptConfig.saltRounds);

      admin = await User.create(
        {
          nom: nom.trim(),
          prenom: prenom.trim(),
          email: emailClean,
          password: hashedPassword,
          telephone: telephone ? telephone.trim() : null,
          role: ROLES.ADMIN,
          isActive: true,
          isVerified: true,
          mustChangePassword: true,
        },
        { transaction: t }
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    // Envoi hors transaction : le compte existe, un email en échec ne doit pas
    // annuler sa création — « Renvoyer les identifiants » permet de réessayer.
    // Le mot de passe en clair n'est jamais journalisé.
    const emailEnvoye = await envoyerAcces(
      { nom: admin.nom, prenom: admin.prenom, email: emailClean },
      motDePasseTemporaire,
      'Yobante Boutique — Vos accès administrateur'
    );

    return {
      success: true,
      message: emailEnvoye
        ? 'Administrateur créé. Les identifiants ont été envoyés par email.'
        : "Administrateur créé, mais l'email des identifiants n'a pas pu être envoyé. Utilisez « Renvoyer les identifiants ».",
      emailEnvoye,
      admin: presenter(admin),
    };
  }

  static async modifierAdmin(id, { nom, prenom, email, telephone }) {
    const admin = await User.findOne({ where: { id, role: ROLES.ADMIN } });
    if (!admin) return { success: false, message: 'Administrateur introuvable' };

    const updates = {};
    if (nom !== undefined && nom.trim()) updates.nom = nom.trim();
    if (prenom !== undefined && prenom.trim()) updates.prenom = prenom.trim();
    if (telephone !== undefined) updates.telephone = telephone ? telephone.trim() : null;

    if (email !== undefined && email.trim()) {
      const emailClean = email.trim().toLowerCase();
      if (emailClean !== admin.email) {
        const exist = await User.findOne({
          where: { email: emailClean, id: { [Op.ne]: id } },
        });
        if (exist) {
          return { success: false, message: 'Cet email est déjà utilisé par un autre compte' };
        }
        updates.email = emailClean;
      }
    }

    if (Object.keys(updates).length > 0) await admin.update(updates);
    invaliderCacheAuth(id);

    return {
      success: true,
      message: 'Administrateur mis à jour avec succès',
      admin: presenter(admin),
    };
  }

  /**
   * Génère un nouveau mot de passe temporaire et l'envoie par email.
   * Les sessions ouvertes sont révoquées : l'ancien mot de passe ne donne plus
   * accès à rien. Le statut (actif / bloqué) n'est PAS modifié : renvoyer des
   * identifiants ne doit pas débloquer un compte à l'insu de l'administrateur.
   */
  static async renvoyerIdentifiants(id, auteurId) {
    if (id === auteurId) {
      return {
        success: false,
        message: 'Pour votre propre compte, changez votre mot de passe depuis votre profil.',
      };
    }

    const admin = await User.findOne({ where: { id, role: ROLES.ADMIN }, attributes: ATTRIBUTS });
    if (!admin) return { success: false, message: 'Administrateur introuvable' };
    if (!admin.email) {
      return {
        success: false,
        message: "Impossible de renvoyer : aucune adresse email n'est associée à ce compte.",
      };
    }

    const motDePasseTemporaire = genererMotDePasse();
    const hashedPassword = await bcrypt.hash(motDePasseTemporaire, bcryptConfig.saltRounds);

    const t = await sequelize.transaction();
    try {
      await User.update(
        { password: hashedPassword, mustChangePassword: true },
        { where: { id }, transaction: t }
      );
      await RefreshToken.update(
        { revoked: true },
        { where: { userId: id, revoked: false }, transaction: t }
      );
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
    invaliderCacheAuth(id);

    const emailDest = admin.email.trim().toLowerCase();
    const emailEnvoye = await envoyerAcces(
      { nom: admin.nom, prenom: admin.prenom, email: emailDest },
      motDePasseTemporaire,
      'Yobante Boutique — Nouveaux accès administrateur'
    );

    if (!emailEnvoye) {
      return {
        success: false,
        message: "Le mot de passe a été réinitialisé mais l'email n'a pas pu être envoyé.",
      };
    }

    return {
      success: true,
      message: `Nouveaux identifiants envoyés à ${emailDest}.`,
      emailEnvoye: true,
      emailDest,
    };
  }

  /**
   * Bascule le statut d'un administrateur. L'UPDATE porte la condition sur
   * l'état attendu : deux clics simultanés ne produisent qu'un changement.
   * Un administrateur ne peut pas se bloquer lui-même, et le dernier
   * administrateur actif ne peut pas être bloqué : le back-office deviendrait
   * inaccessible.
   */
  static async _changerStatut(id, actif, auteurId) {
    if (!actif && id === auteurId) {
      return { success: false, message: 'Vous ne pouvez pas bloquer votre propre compte.' };
    }

    const t = await sequelize.transaction();
    try {
      const admin = await User.findOne({
        where: { id, role: ROLES.ADMIN },
        attributes: ['id', 'isActive'],
        transaction: t,
      });
      if (!admin) {
        await t.rollback();
        return { success: false, message: 'Administrateur introuvable' };
      }

      if (!actif) {
        const actifs = await User.count({
          where: { role: ROLES.ADMIN, isActive: true },
          transaction: t,
        });
        if (admin.isActive && actifs <= 1) {
          await t.rollback();
          return {
            success: false,
            message: 'Impossible de bloquer le dernier administrateur actif.',
          };
        }
      }

      const [nbLignes] = await User.update(
        { isActive: actif },
        { where: { id, role: ROLES.ADMIN, isActive: !actif }, transaction: t }
      );
      if (nbLignes === 0) {
        await t.rollback();
        return {
          success: false,
          message: actif
            ? 'Cet administrateur est déjà actif'
            : 'Cet administrateur est déjà bloqué',
        };
      }

      // Un compte bloqué perd aussi ses sessions : sans cela il pourrait
      // continuer à renouveler son jeton d'accès.
      if (!actif) {
        await RefreshToken.update(
          { revoked: true },
          { where: { userId: id, revoked: false }, transaction: t }
        );
      }
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    invaliderCacheAuth(id);

    return {
      success: true,
      message: actif ? 'Administrateur débloqué avec succès' : 'Administrateur bloqué avec succès',
      statut: actif ? STATUT.ACTIF : STATUT.BLOQUE,
      isBlocked: !actif,
    };
  }

  static bloquerAdmin(id, auteurId) {
    return GestionAdminService._changerStatut(id, false, auteurId);
  }

  static debloquerAdmin(id, auteurId) {
    return GestionAdminService._changerStatut(id, true, auteurId);
  }
}

module.exports = GestionAdminService;
