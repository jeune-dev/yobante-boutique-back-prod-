// ─────────────────────────────────────────────────────────────
// services/client/profil.service.js
// ─────────────────────────────────────────────────────────────
const { Op } = require('sequelize');
const { User, Adresse, Commande, sequelize } = require('../../models');
const { uploadImage, deleteImage } = require('../r2.service');

// Adresses enregistrées (domicile + « autre part »). Les adresses d'une seule
// commande, non enregistrées, ne comptent pas.
const MAX_ADRESSES = 10;

class ProfilService {
  // ✅ PERF: Eager loading pour éviter N+1 queries
  static async getProfil(userId) {
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] },
      include: [
        {
          association: 'adresses',
          attributes: ['id', 'rue', 'ville', 'isDefault'],
          where: { userId },
          required: false,
        },
      ],
    });
    if (!user) {
      return { success: false, message: 'Utilisateur introuvable' };
    }
    return { success: true, user };
  }

  static async updateProfil(userId, { nom, prenom, telephone }) {
    const user = await User.findByPk(userId);
    if (!user) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    await user.update({ nom, prenom, telephone });

    return { success: true, message: 'Profil mis à jour avec succès', user };
  }

  static async updateAvatar(userId, file) {
    if (!file) {
      return { success: false, message: 'Aucun fichier fourni' };
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return { success: false, message: 'Utilisateur introuvable' };
    }

    const ancienAvatar = user.avatar;
    const avatar = await uploadImage(file.buffer, file.originalname, 'avatars');
    await user.update({ avatar });

    if (ancienAvatar) await deleteImage(ancienAvatar);

    return { success: true, message: 'Avatar mis à jour avec succès', avatar };
  }

  // ── Adresses de livraison ─────────────────────────────────────────────────
  //
  //  - L'adresse par défaut (`isDefault`) est le DOMICILE : « Chez moi » au
  //    moment de commander, et l'adresse affichée sur le profil. Il n'y en a
  //    qu'une : en saisir une nouvelle remplace l'ancienne.
  //  - Les autres adresses enregistrées sont celles d'« Autre part »
  //    (« Chez papa »…), réutilisables d'une commande à l'autre.
  //  - Une adresse non enregistrée (`estEnregistree` = false) a servi à une
  //    commande sans que le client veuille la garder : elle n'apparaît pas dans
  //    son carnet.
  //  - Une adresse déjà utilisée par une commande n'est jamais réécrite ni
  //    effacée : l'historique garde l'adresse de livraison d'origine. La
  //    modifier crée une nouvelle version ; la supprimer la masque.

  /** Nombre de commandes livrées (ou à livrer) à cette adresse. */
  static _nbCommandes(adresseId, transaction) {
    return Commande.count({ where: { adresseId }, transaction });
  }

  /** Retire une adresse du carnet : effacée, ou masquée si une commande l'utilise. */
  static async _retirer(adresse, transaction) {
    if (await ProfilService._nbCommandes(adresse.id, transaction)) {
      await adresse.update({ isDefault: false, estEnregistree: false }, { transaction });
    } else {
      await adresse.destroy({ transaction });
    }
  }

  /** Retire le domicile actuel (sauf [saufId]) : il n'y en a qu'un. */
  static async _retirerDomicile(userId, transaction, saufId = null) {
    const where = { userId, isDefault: true };
    if (saufId) where.id = { [Op.ne]: saufId };
    const anciens = await Adresse.findAll({ where, transaction });
    for (const ancien of anciens) await ProfilService._retirer(ancien, transaction);
  }

  /** Champs d'adresse acceptés depuis l'application. */
  static _champs(data) {
    const champs = {};
    for (const cle of [
      'libelle',
      'nomComplet',
      'telephone',
      'rue',
      'ville',
      'region',
      'pays',
      'codePostal',
      'isDefault',
    ]) {
      if (data[cle] !== undefined) champs[cle] = data[cle];
    }
    if (typeof champs.libelle === 'string') {
      champs.libelle = champs.libelle.trim() || null;
    }
    return champs;
  }

  static async getAdresses(userId) {
    const adresses = await Adresse.findAll({
      where: { userId, estEnregistree: true },
      order: [
        ['isDefault', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });

    return { success: true, adresses };
  }

  /**
   * Ajoute une adresse. `enregistrer: false` : adresse d'une seule commande,
   * gardée pour la livraison mais absente du carnet du client.
   */
  static async ajouterAdresse(userId, data) {
    const enregistrer = data.enregistrer !== false;
    const champs = ProfilService._champs(data);
    if (!enregistrer) champs.isDefault = false;

    // Transaction + verrou sur l'utilisateur : sérialise les ajouts d'un même
    // compte (sinon deux requêtes simultanées pourraient dépasser la limite).
    const t = await sequelize.transaction();
    try {
      // PostgreSQL refuse `FOR UPDATE` sur un COUNT (agrégat) : on verrouille
      // la ligne de l'utilisateur.
      await User.findByPk(userId, { attributes: ['id'], transaction: t, lock: t.LOCK.UPDATE });

      if (champs.isDefault) {
        // Nouveau domicile : il remplace l'ancien (pas d'adresse en double).
        await ProfilService._retirerDomicile(userId, t);
      }

      if (enregistrer) {
        const nbAdresses = await Adresse.count({
          where: { userId, estEnregistree: true },
          transaction: t,
        });
        if (nbAdresses >= MAX_ADRESSES) {
          await t.rollback();
          return {
            success: false,
            message: `Vous ne pouvez pas avoir plus de ${MAX_ADRESSES} adresses enregistrées`,
          };
        }
      }

      const adresse = await Adresse.create(
        { pays: 'Sénégal', ...champs, userId, estEnregistree: enregistrer },
        { transaction: t }
      );
      await t.commit();
      return { success: true, message: 'Adresse ajoutée avec succès', adresse };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  /**
   * Modifie une adresse (nom compris : « Chez papa »). Si une commande
   * l'utilise déjà, une nouvelle version est créée et l'ancienne masquée.
   */
  static async updateAdresse(userId, adresseId, data) {
    const t = await sequelize.transaction();
    try {
      const adresse = await Adresse.findOne({
        where: { id: adresseId, userId, estEnregistree: true },
        transaction: t,
      });
      if (!adresse) {
        await t.rollback();
        return { success: false, message: 'Adresse introuvable' };
      }

      const champs = ProfilService._champs(data);
      if (champs.isDefault) await ProfilService._retirerDomicile(userId, t, adresse.id);

      let resultat = adresse;
      if (await ProfilService._nbCommandes(adresse.id, t)) {
        const actuelle = adresse.get({ plain: true });
        delete actuelle.id;
        delete actuelle.createdAt;
        delete actuelle.updatedAt;
        resultat = await Adresse.create({ ...actuelle, ...champs }, { transaction: t });
        await adresse.update({ isDefault: false, estEnregistree: false }, { transaction: t });
      } else {
        await adresse.update(champs, { transaction: t });
      }

      await t.commit();
      return { success: true, message: 'Adresse mise à jour avec succès', adresse: resultat };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  /** Supprime une adresse du carnet (masquée si une commande l'utilise). */
  static async supprimerAdresse(userId, adresseId) {
    const adresse = await Adresse.findOne({
      where: { id: adresseId, userId, estEnregistree: true },
    });
    if (!adresse) {
      return { success: false, message: 'Adresse introuvable' };
    }

    await ProfilService._retirer(adresse);
    return { success: true, message: 'Adresse supprimée avec succès' };
  }

  static async setAdresseDefault(userId, adresseId) {
    const adresse = await Adresse.findOne({
      where: { id: adresseId, userId, estEnregistree: true },
    });
    if (!adresse) {
      return { success: false, message: 'Adresse introuvable' };
    }

    await Adresse.update({ isDefault: false }, { where: { userId, isDefault: true } });
    await adresse.update({ isDefault: true });

    return { success: true, message: 'Adresse définie par défaut', adresse };
  }
}

module.exports = ProfilService;
