// ─────────────────────────────────────────────────────────────
// services/admin/banniere.service.js
// ─────────────────────────────────────────────────────────────
const { Banniere, Categorie, Produit, BanniereProduit } = require('../../models');
const { uploadImage, deleteImage } = require('../r2.service');

class BanniereService {
  static async getAll() {
    const bannieres = await Banniere.findAll({
      include: [
        { model: Categorie, as: 'categorie', attributes: ['id', 'nom', 'slug'] },
        {
          model: Produit,
          as: 'produits',
          through: { attributes: ['ordre'] },
          attributes: ['id', 'nom', 'slug', 'prix', 'prixPromo', 'images'],
        },
      ],
      order: [
        ['ordre', 'ASC'],
        ['createdAt', 'DESC'],
      ],
    });
    return { success: true, bannieres };
  }

  static async create(data, file) {
    if (!file) return { success: false, message: 'Image requise' };

    const imageUrl = await uploadImage(file.buffer, file.originalname, 'bannieres');
    const banniere = await Banniere.create({ ...data, image: imageUrl });
    return { success: true, message: 'Bannière créée avec succès', banniere };
  }

  static async update(id, data, file) {
    const banniere = await Banniere.findByPk(id);
    if (!banniere) return { success: false, message: 'Bannière introuvable' };

    const updates = { ...data };
    if (file) {
      await deleteImage(banniere.image);
      updates.image = await uploadImage(file.buffer, file.originalname, 'bannieres');
    }

    await banniere.update(updates);
    return { success: true, message: 'Bannière mise à jour', banniere };
  }

  static async remove(id) {
    const banniere = await Banniere.findByPk(id);
    if (!banniere) return { success: false, message: 'Bannière introuvable' };

    await deleteImage(banniere.image);
    await banniere.destroy();
    return { success: true, message: 'Bannière supprimée' };
  }

  static async toggleActive(id) {
    const banniere = await Banniere.findByPk(id);
    if (!banniere) return { success: false, message: 'Bannière introuvable' };

    banniere.isActive = !banniere.isActive;
    await banniere.save();
    return { success: true, banniere };
  }

  static async reordonner(ordres) {
    // ordres = [{ id, ordre }, ...]
    await Promise.all(ordres.map(({ id, ordre }) => Banniere.update({ ordre }, { where: { id } })));
    return { success: true, message: 'Ordre mis à jour' };
  }

  static async ajouterProduit(banniereId, { produitId, ordre = 0 }) {
    const banniere = await Banniere.findByPk(banniereId);
    if (!banniere) return { success: false, message: 'Bannière introuvable' };
    const produit = await Produit.findByPk(produitId);
    if (!produit) return { success: false, message: 'Produit introuvable' };
    const exist = await BanniereProduit.findOne({ where: { banniereId, produitId } });
    if (exist) return { success: false, message: 'Produit déjà associé à cette bannière' };
    const item = await BanniereProduit.create({ banniereId, produitId, ordre });
    return { success: true, message: 'Produit ajouté à la bannière', item };
  }

  static async retirerProduit(banniereId, produitId) {
    const deleted = await BanniereProduit.destroy({ where: { banniereId, produitId } });
    if (!deleted) return { success: false, message: 'Association introuvable' };
    return { success: true, message: 'Produit retiré de la bannière' };
  }
}

module.exports = BanniereService;
