const { NIVEAU_STOCK, SEUILS_STOCK } = require('../constants');

/**
 * Classe un stock sur les quatre paliers d'alerte de la boutique.
 *
 * Règle unique, partagée par le tableau de bord et la liste des produits :
 * deux implémentations séparées finiraient par diverger et afficheraient deux
 * couleurs différentes pour le même produit.
 *
 *  ⚫ rupture            stock = 0
 *  🔴 rupture imminente  0 < stock <= SEUILS_STOCK.RUPTURE_IMMINENTE
 *  🟠 faible             stock <= SEUILS_STOCK.FAIBLE
 *  🟢 normal             au-delà
 */
function niveauDeStock(stock) {
  const quantite = Number(stock) || 0;
  if (quantite <= 0) return NIVEAU_STOCK.RUPTURE;
  if (quantite <= SEUILS_STOCK.RUPTURE_IMMINENTE) return NIVEAU_STOCK.RUPTURE_IMMINENTE;
  if (quantite <= SEUILS_STOCK.FAIBLE) return NIVEAU_STOCK.FAIBLE;
  return NIVEAU_STOCK.NORMAL;
}

/**
 * Nombre de jours avant rupture au rythme de vente observé.
 * `null` quand aucune vente n'a été enregistrée : le stock est alors
 * inépuisable au rythme actuel, ce qui n'est pas la même information que 0.
 */
function joursDeCouverture(stock, quantiteVendue, fenetreJours) {
  const vendu = Number(quantiteVendue) || 0;
  if (vendu <= 0) return null;
  const parJour = vendu / fenetreJours;
  return Math.round((Number(stock) || 0) / parJour);
}

module.exports = { niveauDeStock, joursDeCouverture };
