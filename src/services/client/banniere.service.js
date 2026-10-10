// ─────────────────────────────────────────────────────────────
// services/client/banniere.service.js
// ─────────────────────────────────────────────────────────────
const { Banniere, BanniereProduit, Categorie, Produit, Rayon } = require('../../models');
const ProduitService = require('./produit.service');

class BanniereClientService {
  static async getActives() {
    const bannieres = await Banniere.findAll({
      where: { isActive: true },
      include: [
        { model: Categorie, as: 'categorie', attributes: ['id', 'nom', 'slug'] },
        { model: Rayon, as: 'rayon', attributes: ['id', 'nom'] },
        {
          model: Produit,
          as: 'produits',
          through: { attributes: ['ordre'] },
          attributes: ['id', 'nom', 'slug', 'prix', 'prixPromo', 'images'],
          // Seuls les produits visibles des acheteurs comptent : l'application
          // s'appuie sur leur présence pour ouvrir la page de la bannière.
          where: ProduitService.VISIBLE_AU_PUBLIC,
          required: false,
        },
      ],
      order: [['ordre', 'ASC']],
    });
    return { success: true, bannieres };
  }

  /**
   * Produits mis en avant par une bannière, au format du catalogue
   * (`GET /produits`) : vendeur et boutique inclus, pour que l'application
   * puisse les afficher et les mettre au panier comme n'importe quel produit.
   */
  static async getProduits(banniereId) {
    // Identifiant mal formé : introuvable, plutôt qu'une erreur SQL.
    if (!/^[0-9a-f-]{36}$/i.test(String(banniereId))) {
      return { success: false, message: 'Bannière introuvable' };
    }
    const banniere = await Banniere.findOne({ where: { id: banniereId, isActive: true } });
    if (!banniere) return { success: false, message: 'Bannière introuvable' };

    const liens = await BanniereProduit.findAll({
      where: { banniereId },
      order: [['ordre', 'ASC']],
    });
    const ids = liens.map((l) => l.produitId);
    if (ids.length === 0) return { success: true, banniere, produits: [] };

    const produits = await Produit.findAll({
      where: { id: ids, ...ProduitService.VISIBLE_AU_PUBLIC },
      include: ProduitService.CATALOGUE_INCLUDE,
      attributes: { exclude: ['prixAchat'] },
    });
    // Ordre choisi dans le dashboard
    const rang = new Map(ids.map((id, i) => [id, i]));
    produits.sort((a, b) => rang.get(a.id) - rang.get(b.id));
    return { success: true, banniere, produits };
  }
}

module.exports = BanniereClientService;
