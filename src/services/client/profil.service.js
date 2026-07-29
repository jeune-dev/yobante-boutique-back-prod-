// ─────────────────────────────────────────────────────────────
// services/client/profil.service.js
// ─────────────────────────────────────────────────────────────
const { User, Adresse, Commande, sequelize } = require('../../models');
const { uploadImage, deleteImage } = require('../r2.service');

const MAX_ADRESSES = 5;

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

  static async getAdresses(userId) {
    const adresses = await Adresse.findAll({
      where: { userId },
      order: [
        ['isDefault', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });

    return { success: true, adresses };
  }

  static async ajouterAdresse(userId, data) {
    // Transaction + lock pour éviter la race condition count-then-create
    // (deux requêtes simultanées pourraient dépasser MAX_ADRESSES sans ça)
    const t = await sequelize.transaction();
    try {
      const nbAdresses = await Adresse.count({ where: { userId }, transaction: t, lock: true });
      if (nbAdresses >= MAX_ADRESSES) {
        await t.rollback();
        return {
          success: false,
          message: `Vous ne pouvez pas avoir plus de ${MAX_ADRESSES} adresses`,
        };
      }

      if (data.isDefault) {
        await Adresse.update(
          { isDefault: false },
          { where: { userId, isDefault: true }, transaction: t }
        );
      }

      const adresse = await Adresse.create({ ...data, userId }, { transaction: t });
      await t.commit();
      return { success: true, message: 'Adresse ajoutée avec succès', adresse };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  static async updateAdresse(userId, adresseId, data) {
    const adresse = await Adresse.findOne({ where: { id: adresseId, userId } });
    if (!adresse) {
      return { success: false, message: 'Adresse introuvable' };
    }

    if (data.isDefault) {
      await Adresse.update({ isDefault: false }, { where: { userId, isDefault: true } });
    }

    await adresse.update(data);

    return { success: true, message: 'Adresse mise à jour avec succès', adresse };
  }

  static async supprimerAdresse(userId, adresseId) {
    const adresse = await Adresse.findOne({ where: { id: adresseId, userId } });
    if (!adresse) {
      return { success: false, message: 'Adresse introuvable' };
    }

    // Bloquer la suppression si des commandes référencent cette adresse.
    // Les supprimer effacerait l'adresse de livraison de l'historique commandes.
    const nbCommandes = await Commande.count({ where: { adresseId } });
    if (nbCommandes > 0) {
      return {
        success: false,
        status: 409,
        message: `Impossible de supprimer : ${nbCommandes} commande(s) référencent cette adresse`,
      };
    }

    await adresse.destroy();
    return { success: true, message: 'Adresse supprimée avec succès' };
  }

  static async setAdresseDefault(userId, adresseId) {
    const adresse = await Adresse.findOne({ where: { id: adresseId, userId } });
    if (!adresse) {
      return { success: false, message: 'Adresse introuvable' };
    }

    await Adresse.update({ isDefault: false }, { where: { userId, isDefault: true } });
    await adresse.update({ isDefault: true });

    return { success: true, message: 'Adresse définie par défaut', adresse };
  }
}

module.exports = ProfilService;
