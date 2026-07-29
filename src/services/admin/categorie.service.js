// ─────────────────────────────────────────────────────────────
// services/admin/categorie.service.js
// ─────────────────────────────────────────────────────────────
const { Categorie, Produit } = require('../../models');
const { generateUniqueSlug } = require('../../utils/slugify');
const { uploadImage, deleteImage } = require('../r2.service');

class GestionCategorieService {
  static async createCategorie({ nom, description, image, parentId }, file = null) {
    if (parentId) {
      const parent = await Categorie.findByPk(parentId);
      if (!parent) {
        return { success: false, message: 'Catégorie parente introuvable' };
      }
    }

    const slug = await generateUniqueSlug(Categorie, nom);

    if (file) {
      image = await uploadImage(file.buffer, file.originalname, 'categories');
    }

    const categorie = await Categorie.create({ nom, slug, description, image, parentId });

    return { success: true, message: 'Catégorie créée avec succès', categorie };
  }

  static async updateCategorie(id, { nom, description, image, parentId, isActive }, file = null) {
    const categorie = await Categorie.findByPk(id);
    if (!categorie) {
      return { success: false, message: 'Catégorie introuvable' };
    }

    // On n'inclut que les champs explicitement fournis pour éviter d'écraser avec undefined/null
    const updates = {};
    if (description !== undefined) updates.description = description;
    if (image !== undefined) updates.image = image;
    if (parentId !== undefined) updates.parentId = parentId;
    if (isActive !== undefined) updates.isActive = isActive;
    if (nom && nom !== categorie.nom) {
      updates.nom = nom;
      updates.slug = await generateUniqueSlug(Categorie, nom, id);
    }

    if (file) {
      updates.image = await uploadImage(file.buffer, file.originalname, 'categories');
      if (categorie.image) await deleteImage(categorie.image);
    }

    await categorie.update(updates);

    return { success: true, message: 'Catégorie mise à jour avec succès', categorie };
  }

  /** Retourne l'id de la catégorie + tous ses descendants (sous-catégories à tous les niveaux). */
  static async _getArborescenceIds(id) {
    const ids = [id];
    let niveauActuel = [id];

    while (niveauActuel.length > 0) {
      const enfants = await Categorie.findAll({
        where: { parentId: niveauActuel },
        attributes: ['id'],
      });
      const enfantsIds = enfants.map((c) => c.id);
      ids.push(...enfantsIds);
      niveauActuel = enfantsIds;
    }

    return ids;
  }

  static async deleteCategorie(id) {
    const categorie = await Categorie.findByPk(id);
    if (!categorie) {
      return { success: false, message: 'Catégorie introuvable' };
    }

    // Bloquer si des produits actifs utilisent cette catégorie ou ses sous-catégories.
    // On fait un soft-delete (isActive=false) pour ne jamais casser l'historique commandes.
    const arborescenceIds = await GestionCategorieService._getArborescenceIds(id);
    const nbProduitsActifs = await Produit.count({
      where: { categorieId: arborescenceIds, isActive: true },
    });
    if (nbProduitsActifs > 0) {
      return {
        success: false,
        message:
          "Impossible de supprimer : des produits actifs utilisent cette catégorie ou l'une de ses sous-catégories",
      };
    }

    // Soft-delete : on désactive la catégorie plutôt que de la supprimer physiquement.
    // Un hard-delete cascaderait aux produits et détruirait l'historique des commandes.
    await categorie.update({ isActive: false });

    return { success: true, message: 'Catégorie désactivée avec succès' };
  }

  static async getAllCategories() {
    const categories = await Categorie.findAll({
      where: { parentId: null },
      include: [{ model: Categorie, as: 'sousCategories' }],
      order: [['nom', 'ASC']],
    });

    return { success: true, message: 'Liste des catégories', categories };
  }

  static async getCategorieById(id) {
    const categorie = await Categorie.findByPk(id, {
      include: [{ model: Produit, as: 'produits', where: { isActive: true }, required: false }],
    });

    if (!categorie) {
      return { success: false, message: 'Catégorie introuvable' };
    }

    return { success: true, categorie };
  }
}

module.exports = GestionCategorieService;
