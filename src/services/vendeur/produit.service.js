const { Op } = require('sequelize');
const { Produit, Avis, sequelize } = require('../../models');
const { generateUniqueSlug, createWithUniqueSlug } = require('../../utils/slugify');
const paginate = require('../../utils/paginate');
const { uploadImage, deleteImage } = require('../r2.service');
const { STATUT_VALIDATION_PRODUIT } = require('../../constants');

/**
 * Champs qu'un vendeur est autorisé à renseigner lui-même.
 *
 * Liste blanche explicite : recopier le corps de requête tel quel laisserait
 * un vendeur positionner `isFeatured`, `noteMoyenne`, `prixPromo` ou `stock`,
 * qui relèvent tous de l'administration. Le vendeur demande un `stockAlloue` ;
 * c'est l'admin qui décide du `stock` réellement ouvert à la vente.
 */
const CHAMPS_VENDEUR = [
  'nom',
  'description',
  'prix',
  'stockAlloue',
  'poids',
  'infoLegale',
  'messageVendeur',
];

const filtrerChampsVendeur = (data = {}) =>
  Object.fromEntries(
    Object.entries(data).filter(
      ([cle, valeur]) => CHAMPS_VENDEUR.includes(cle) && valeur !== undefined
    )
  );

class VendeurProduitService {
  static async soumettreProduit(vendeurId, data, files = []) {
    const slug = await generateUniqueSlug(Produit, data.nom);
    const payload = {
      ...filtrerChampsVendeur(data),
      slug,
      vendeurId,
      statutValidation: STATUT_VALIDATION_PRODUIT.EN_ATTENTE,
      isActive: false,
      motifRejet: null,
    };

    if (files && files.length) {
      payload.images = await Promise.all(
        files.map((f) => uploadImage(f.buffer, f.originalname, 'produits'))
      );
    }

    // createWithUniqueSlug gère la race condition de slug en cas de collision
    const produit = await createWithUniqueSlug(Produit, payload, data.nom);
    return { success: true, message: 'Produit soumis pour validation', produit };
  }

  static async getMesProduits(vendeurId, { page, limit, search, statut } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);
    const where = { vendeurId };
    if (search) where.nom = { [Op.iLike]: `%${search}%` };
    if (statut) where.statutValidation = statut;

    const { count, rows } = await Produit.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: l,
      offset,
    });

    return {
      success: true,
      produits: rows,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async getProduitById(vendeurId, id) {
    const produit = await Produit.findOne({
      where: { id, vendeurId },
      include: [{ model: Avis, as: 'avis', limit: 10, order: [['createdAt', 'DESC']] }],
    });
    if (!produit) return { success: false, message: 'Produit introuvable' };
    return { success: true, produit };
  }

  static async updateProduit(vendeurId, id, data, files = []) {
    const produit = await Produit.findOne({ where: { id, vendeurId } });
    if (!produit) return { success: false, message: 'Produit introuvable ou non autorisé' };

    // Toute modification repart en validation : on efface le motif de rejet
    // précédent, qui ne concerne plus la version soumise.
    const updates = {
      ...filtrerChampsVendeur(data),
      statutValidation: STATUT_VALIDATION_PRODUIT.EN_ATTENTE,
      isActive: false,
      motifRejet: null,
    };

    if (data.nom && data.nom !== produit.nom) {
      updates.slug = await generateUniqueSlug(Produit, data.nom, id);
    }

    if (files && files.length) {
      const anciennesImages = produit.images || [];
      updates.images = await Promise.all(
        files.map((f) => uploadImage(f.buffer, f.originalname, 'produits'))
      );
      await Promise.all(anciennesImages.map((url) => deleteImage(url)));
    }

    await produit.update(updates);
    return { success: true, message: 'Produit modifié — en attente de revalidation', produit };
  }

  /**
   * Mise à jour de stock — deux modes :
   * - `delta` (relatif) : incrément/décrément atomique, sans risque d'écrasement concurrent
   * - `absolu` (valeur fixe) : réservé aux corrections manuelles, moins sûr en concurrence
   *
   * Le paramètre `mode` vaut 'delta' par défaut.
   * Exemple : { stock: 10, mode: 'delta' } ajoute 10 au stock existant.
   *           { stock: 50, mode: 'absolu' } fixe le stock à 50.
   */
  static async updateStock(vendeurId, id, { stock, stockAlloue, mode = 'absolu' } = {}) {
    const produit = await Produit.findOne({ where: { id, vendeurId } });
    if (!produit) return { success: false, message: 'Produit introuvable ou non autorisé' };

    if (mode === 'delta' && stock !== undefined) {
      // Incrément relatif atomique — pas de read-modify-write
      const newStock = produit.stock + stock;
      if (newStock < 0) return { success: false, message: 'Le stock ne peut pas être négatif' };

      await Produit.update(
        { stock: sequelize.literal(`stock + ${stock}`) },
        { where: { id, vendeurId, stock: { [Op.gte]: Math.abs(Math.min(stock, 0)) } } }
      );
    } else {
      // Mise à jour absolue
      const updates = {};
      if (stock !== undefined) {
        if (stock < 0) return { success: false, message: 'Le stock ne peut pas être négatif' };
        updates.stock = stock;
      }
      if (stockAlloue !== undefined) updates.stockAlloue = stockAlloue;
      if (Object.keys(updates).length) await produit.update(updates);
    }

    const updated = await Produit.findByPk(id, {
      attributes: ['id', 'nom', 'stock', 'stockAlloue'],
    });
    return { success: true, message: 'Stock mis à jour', produit: updated };
  }

  static async supprimerProduit(vendeurId, id) {
    const produit = await Produit.findOne({ where: { id, vendeurId } });
    if (!produit) return { success: false, message: 'Produit introuvable ou non autorisé' };
    await produit.update({ isActive: false });
    return { success: true, message: 'Produit désactivé' };
  }

  static async getStats(vendeurId) {
    const [total, valides, enAttente, rejetes, ruptureStock] = await Promise.all([
      Produit.count({ where: { vendeurId } }),
      Produit.count({
        where: { vendeurId, statutValidation: STATUT_VALIDATION_PRODUIT.VALIDE, isActive: true },
      }),
      Produit.count({
        where: { vendeurId, statutValidation: STATUT_VALIDATION_PRODUIT.EN_ATTENTE },
      }),
      Produit.count({ where: { vendeurId, statutValidation: STATUT_VALIDATION_PRODUIT.REJETE } }),
      Produit.count({ where: { vendeurId, stock: 0, isActive: true } }),
    ]);

    return { success: true, stats: { total, valides, enAttente, rejetes, ruptureStock } };
  }
}

module.exports = VendeurProduitService;
