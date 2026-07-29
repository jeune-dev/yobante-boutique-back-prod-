const { Panier, Produit, FraisLivraison, sequelize } = require('../../models');
const { FRAIS_LIVRAISON_DEFAUT } = require('../../constants');

async function _getFraisLivraison(ville) {
  if (ville) {
    const tarif = await FraisLivraison.findOne({ where: { ville, isActive: true } });
    if (tarif) return Number(tarif.montant);
  }
  return FRAIS_LIVRAISON_DEFAUT;
}

class PanierService {
  // ✅ PERF: Paralléliser les requêtes indépendantes
  static async _buildPanier(userId, ville) {
    // Récupérer le panier ET les frais en parallèle
    const [items, fraisLivraison] = await Promise.all([
      Panier.findAll({
        where: { userId },
        include: [{ model: Produit, as: 'produit' }],
        order: [['createdAt', 'ASC']],
      }),
      _getFraisLivraison(ville),
    ]);

    const lignes = items.map((item) => ({
      id: item.id,
      produit: item.produit,
      quantite: item.quantite,
      sousTotal: Number(item.produit.prix) * item.quantite,
    }));

    const sousTotal = lignes.reduce((sum, l) => sum + l.sousTotal, 0);

    return { items: lignes, sousTotal, fraisLivraison, total: sousTotal + fraisLivraison };
  }

  static async getPanier(userId, ville) {
    const panier = await PanierService._buildPanier(userId, ville);
    return { success: true, ...panier };
  }

  /**
   * Ajouter au panier sans race condition :
   * - findOrCreate garantit l'unicité (userId, produitId) même en concurrence
   * - l'incrément de quantité se fait par UPDATE atomique, pas par read-modify-write
   * - la vérification de stock finale reste une garde logicielle (le vrai garde est dans passerCommande)
   */
  static async ajouterAuPanier(userId, produitId, quantite = 1) {
    const produit = await Produit.findOne({
      where: { id: produitId, isActive: true },
      attributes: ['id', 'nom', 'prix', 'stock'],
    });
    if (!produit) return { success: false, message: 'Produit introuvable' };
    if (produit.stock < quantite) return { success: false, message: 'Stock insuffisant' };

    const t = await sequelize.transaction();
    try {
      // findOrCreate : si deux requêtes arrivent en même temps, l'une crée et l'autre trouve
      const [ligne, _created] = await Panier.findOrCreate({
        where: { userId, produitId },
        defaults: { userId, produitId, quantite: 0 },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      const nouvelleQuantite = ligne.quantite + quantite;

      // Vérification de stock contre la quantité totale demandée
      if (produit.stock < nouvelleQuantite) {
        await t.rollback();
        return { success: false, message: 'Stock insuffisant' };
      }

      // Incrément atomique : évite les conflits d'écriture si un autre UPDATE arrive
      await Panier.update(
        { quantite: sequelize.literal(`quantite + ${quantite}`) },
        { where: { userId, produitId }, transaction: t }
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    const panier = await PanierService._buildPanier(userId);
    return { success: true, message: 'Produit ajouté au panier', ...panier };
  }

  static async modifierQuantite(userId, produitId, quantite) {
    const ligne = await Panier.findOne({ where: { userId, produitId } });
    if (!ligne) return { success: false, message: "Ce produit n'est pas dans votre panier" };

    if (quantite === 0) {
      await ligne.destroy();
    } else {
      const produit = await Produit.findByPk(produitId, { attributes: ['stock'] });
      if (produit.stock < quantite) return { success: false, message: 'Stock insuffisant' };
      // UPDATE direct — pas de read-modify-write race (on fixe une valeur absolue voulue par l'utilisateur)
      await ligne.update({ quantite });
    }

    const panier = await PanierService._buildPanier(userId);
    return { success: true, message: 'Panier mis à jour', ...panier };
  }

  static async retirerDuPanier(userId, produitId) {
    const ligne = await Panier.findOne({ where: { userId, produitId } });
    if (!ligne) return { success: false, message: "Ce produit n'est pas dans votre panier" };
    await ligne.destroy();
    return { success: true, message: 'Produit retiré du panier' };
  }

  static async viderPanier(userId) {
    await Panier.destroy({ where: { userId } });
    return { success: true, message: 'Panier vidé' };
  }
}

module.exports = PanierService;
