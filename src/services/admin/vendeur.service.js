// ─────────────────────────────────────────────────────────────
// services/admin/vendeur.service.js — Gestion des comptes vendeurs
//
// Un vendeur est créé par un administrateur et il est ACTIF immédiatement :
// il n'y a plus de circuit de validation en deux étapes. Le seul état qui
// varie ensuite est `actif` / `bloque`, piloté par l'administrateur.
// ─────────────────────────────────────────────────────────────
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, ProfilVendeur, Produit, sequelize } = require('../../models');
const { bcryptConfig } = require('../../config/security');
const { ROLES, STATUT_VENDEUR } = require('../../constants');
const paginate = require('../../utils/paginate');
const logger = require('../../config/logger');
const cache = require('../../config/cache');
const { sendEmail } = require('../resend.service');
const vendeurAccesTemplate = require('../../templates/mail/vendeurAcces.template');

// Alphabets sans caractères ambigus (0/O, 1/l/I) : le mot de passe est recopié
// à la main depuis un email, la confusion coûte un ticket de support.
const MAJUSCULES = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MINUSCULES = 'abcdefghjkmnpqrstuvwxyz';
const CHIFFRES = '23456789';

/** Tirage uniforme non biaisé dans `alphabet` (crypto, pas Math.random). */
const tirer = (alphabet) => alphabet[crypto.randomInt(alphabet.length)];

class GestionVendeurService {
  /**
   * Mot de passe temporaire : au moins une majuscule et un chiffre, pour
   * satisfaire les règles de complexité exigées lors du changement.
   */
  static _genererMotDePasse(longueur = 12) {
    const tous = MAJUSCULES + MINUSCULES + CHIFFRES;
    const caracteres = [tirer(MAJUSCULES), tirer(CHIFFRES), tirer(MINUSCULES)];
    for (let i = caracteres.length; i < longueur; i++) caracteres.push(tirer(tous));

    // Mélange de Fisher-Yates : `sort(() => Math.random() - 0.5)` ne produit pas
    // une permutation uniforme et laisserait la majuscule souvent en tête.
    for (let i = caracteres.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
    }
    return caracteres.join('');
  }

  /** Purge le cache d'authentification : le blocage est vu à la requête suivante. */
  static _invaliderCacheAuth(userId) {
    cache.del(`auth:${userId}`);
    cache.del(`${ROLES.ADMIN}:${userId}`);
  }

  /**
   * Vue « vendeur » attendue par l'interface admin : les informations de la
   * boutique sont remontées à plat (`nomBoutique`, `adresseBoutique`, …) *et*
   * regroupées sous `boutique`, car les deux écrans admin les lisaient
   * différemment. Sans cette mise à plat, la colonne Boutique restait vide :
   * le backend ne renvoyait que `profilVendeur.nomBoutique`.
   */
  static _presenter(user) {
    if (!user) return null;
    const brut = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
    const profil = brut.profilVendeur || null;
    delete brut.password;

    const boutique = profil
      ? {
          id: profil.id,
          nom: profil.nomBoutique || null,
          description: profil.description || null,
          adresse: profil.adresseBoutique || null,
          telephone: profil.telephone || null,
          infoLegale: profil.infoLegale || null,
          logo: profil.logo || null,
          latitude: profil.latitude ?? null,
          longitude: profil.longitude ?? null,
        }
      : null;

    return {
      ...brut,
      statut: brut.isActive ? STATUT_VENDEUR.ACTIF : STATUT_VENDEUR.BLOQUE,
      isBlocked: !brut.isActive,
      boutique,
      // Champs à plat consommés directement par les tableaux de l'admin
      nomBoutique: boutique?.nom ?? null,
      adresseBoutique: boutique?.adresse ?? null,
      descriptionBoutique: boutique?.description ?? null,
      telephoneBoutique: boutique?.telephone ?? null,
      logoBoutique: boutique?.logo ?? null,
    };
  }

  static async creerVendeur(data) {
    const emailClean = data.email.trim().toLowerCase();
    const motDePasseTemporaire = GestionVendeurService._genererMotDePasse();

    const t = await sequelize.transaction();
    let user;
    let profil;
    try {
      const exist = await User.findOne({ where: { email: emailClean }, transaction: t });
      if (exist) {
        await t.rollback();
        return { success: false, message: 'Cet email est déjà utilisé' };
      }

      const hashedPassword = await bcrypt.hash(motDePasseTemporaire, bcryptConfig.saltRounds);

      user = await User.create(
        {
          nom: data.nom,
          prenom: data.prenom,
          email: emailClean,
          password: hashedPassword,
          telephone: data.telephone || null,
          role: ROLES.VENDEUR,
          isVerified: true,
          // Opérationnel dès la création : plus d'attente de validation.
          // Seul un blocage explicite le désactive.
          isActive: true,
          mustChangePassword: true,
        },
        { transaction: t }
      );

      profil = await ProfilVendeur.create(
        {
          userId: user.id,
          nomBoutique: data.nomBoutique,
          description: data.description || null,
          infoLegale: data.infoLegale || null,
          adresseBoutique: data.adresseBoutique || null,
          telephone: data.telephone || null,
          isActive: true,
          // Colonnes héritées du circuit de validation, conservées en base :
          // renseignées à true pour rester cohérentes avec un compte actif.
          isValidatedStep1: true,
          isValidatedStep2: true,
        },
        { transaction: t }
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    // Envoi hors transaction : le compte existe, un email en échec ne doit pas
    // annuler sa création. Le mot de passe en clair n'est jamais journalisé.
    const envoi = await sendEmail({
      to: emailClean,
      subject: 'Bienvenue sur Yobante Boutique — Vos accès vendeur',
      html: vendeurAccesTemplate({
        nom: data.nom,
        prenom: data.prenom,
        email: emailClean,
        telephone: data.telephone,
        motDePasseTemporaire,
        lienConnexion: process.env.FRONTEND_URL || 'https://yobante.com',
      }),
    });

    if (!envoi.success) {
      logger.error('[Vendeur] Email des accès non envoyé', { userId: user.id, error: envoi.error });
    }

    const vendeur = GestionVendeurService._presenter({
      ...user.toJSON(),
      profilVendeur: profil.toJSON(),
    });

    return {
      success: true,
      message: envoi.success
        ? 'Compte vendeur créé. Les identifiants ont été envoyés par email.'
        : "Compte vendeur créé, mais l'email des identifiants n'a pas pu être envoyé.",
      emailEnvoye: envoi.success,
      vendeur,
      profil,
    };
  }

  static async listerVendeurs({ page, limit, search, statut } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);

    const where = { role: ROLES.VENDEUR };
    if (search) {
      where[Op.or] = [
        { nom: { [Op.iLike]: `%${search}%` } },
        { prenom: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (statut === STATUT_VENDEUR.ACTIF) where.isActive = true;
    else if (statut === STATUT_VENDEUR.BLOQUE) where.isActive = false;

    const { count, rows } = await User.findAndCountAll({
      where,
      include: [{ model: ProfilVendeur, as: 'profilVendeur', required: false }],
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']],
      limit: l,
      offset,
    });

    return {
      success: true,
      vendeurs: rows.map((row) => GestionVendeurService._presenter(row)),
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async getVendeur(id) {
    const user = await User.findOne({
      where: { id, role: ROLES.VENDEUR },
      attributes: { exclude: ['password'] },
      include: [
        { model: ProfilVendeur, as: 'profilVendeur' },
        { model: Produit, as: 'produits', limit: 5, order: [['createdAt', 'DESC']] },
      ],
    });
    if (!user) return { success: false, message: 'Vendeur introuvable' };
    return { success: true, vendeur: GestionVendeurService._presenter(user) };
  }

  /** Statut courant, lu en base — source de vérité de l'interface. */
  static async getStatut(id) {
    const user = await User.findOne({
      where: { id, role: ROLES.VENDEUR },
      attributes: ['id', 'isActive'],
    });
    if (!user) return { success: false, message: 'Vendeur introuvable' };

    return {
      success: true,
      message: 'Statut du vendeur',
      statut: user.isActive ? STATUT_VENDEUR.ACTIF : STATUT_VENDEUR.BLOQUE,
      isBlocked: !user.isActive,
    };
  }

  /**
   * Bascule le statut d'un vendeur.
   * L'UPDATE porte la condition sur l'état attendu : deux administrateurs qui
   * cliquent en même temps ne produisent qu'un seul changement effectif, le
   * second reçoit « déjà bloqué / déjà actif » au lieu d'un faux succès.
   */
  static async _changerStatut(id, actif) {
    const t = await sequelize.transaction();
    try {
      const user = await User.findOne({
        where: { id, role: ROLES.VENDEUR },
        attributes: ['id', 'isActive'],
        transaction: t,
      });
      if (!user) {
        await t.rollback();
        return { success: false, message: 'Vendeur introuvable' };
      }

      const [nbLignes] = await User.update(
        { isActive: actif },
        { where: { id, isActive: !actif }, transaction: t }
      );

      if (nbLignes === 0) {
        await t.rollback();
        return {
          success: false,
          message: actif ? 'Ce vendeur est déjà actif' : 'Ce vendeur est déjà bloqué',
          statut: actif ? STATUT_VENDEUR.ACTIF : STATUT_VENDEUR.BLOQUE,
        };
      }

      // Le profil boutique suit le compte : un vendeur bloqué ne passe plus le
      // middleware vendeur et n'apparaît plus comme boutique active.
      await ProfilVendeur.update({ isActive: actif }, { where: { userId: id }, transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    GestionVendeurService._invaliderCacheAuth(id);

    return {
      success: true,
      message: actif ? 'Vendeur débloqué avec succès' : 'Vendeur bloqué avec succès',
      statut: actif ? STATUT_VENDEUR.ACTIF : STATUT_VENDEUR.BLOQUE,
      isBlocked: !actif,
    };
  }

  static bloquerVendeur(id) {
    return GestionVendeurService._changerStatut(id, false);
  }

  static debloquerVendeur(id) {
    return GestionVendeurService._changerStatut(id, true);
  }

  static async updateProfil(id, data) {
    const profil = await ProfilVendeur.findOne({ where: { userId: id } });
    if (!profil) return { success: false, message: 'Profil vendeur introuvable' };
    await profil.update(data);
    return { success: true, message: 'Profil mis à jour', profil };
  }
}

module.exports = GestionVendeurService;
