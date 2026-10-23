// ─────────────────────────────────────────────────────────────
// services/mouvementStock.service.js — Écriture du journal de stock
//
// Point d'entrée UNIQUE pour tracer un changement de quantité. Tout chemin
// qui touche à `produits.stock` passe par ici, dans SA transaction : un
// stock modifié sans trace, ou une trace sans stock modifié, est impossible.
//
// Aucune fonction de mise à jour ni de suppression : l'historique s'ajoute,
// il ne se réécrit pas.
// ─────────────────────────────────────────────────────────────
const { MouvementStock, Produit } = require('../models');
const { TYPE_MOUVEMENT_STOCK, SOURCE_MOUVEMENT_STOCK } = require('../constants');

/**
 * Les trois moments du cycle de vie d'une commande où le stock change
 * réellement, relevés dans `services/client/commande.service.js` :
 *
 *  - `creation`   : décrément à la création de la commande (statut initial
 *                   `en_attente`) — c'est là, et pas au paiement ni à la
 *                   validation, que la marchandise quitte le stock ;
 *  - `annulation` : remise en stock quand le client annule sa commande ;
 *  - `rejet`      : remise en stock quand l'administration la rejette.
 *
 * Les transitions `validee`, `en_preparation`, `expediee` et `livree` ne
 * touchent pas au stock (`_transition` ne change que le statut) : aucun
 * mouvement n'y est écrit, sans quoi la même sortie serait comptée deux fois.
 * Aucun chemin de retour produit n'existe aujourd'hui dans le code — le type
 * `retour` reste donc déclaré mais n'est émis par personne.
 */
const EVENEMENTS_COMMANDE = Object.freeze({
  creation: {
    sens: -1,
    type: TYPE_MOUVEMENT_STOCK.SORTIE,
    source: SOURCE_MOUVEMENT_STOCK.COMMANDE_CREATION,
  },
  annulation: {
    sens: 1,
    type: TYPE_MOUVEMENT_STOCK.ENTREE,
    source: SOURCE_MOUVEMENT_STOCK.COMMANDE_ANNULATION,
  },
  rejet: {
    sens: 1,
    type: TYPE_MOUVEMENT_STOCK.ENTREE,
    source: SOURCE_MOUVEMENT_STOCK.COMMANDE_REJET,
  },
});

/** Type d'un ajustement manuel, déduit du sens de l'écart. */
const typeAjustement = (difference) => {
  if (difference > 0) return TYPE_MOUVEMENT_STOCK.AJUSTEMENT_POSITIF;
  if (difference < 0) return TYPE_MOUVEMENT_STOCK.AJUSTEMENT_NEGATIF;
  return TYPE_MOUVEMENT_STOCK.AJUSTEMENT_NEUTRE;
};

/**
 * Trace les mouvements provoqués par une commande, DANS la transaction qui
 * vient de modifier le stock.
 *
 * Les quantités après coup sont relues en base plutôt que recalculées de
 * tête : la décrémentation se fait par `stock - n` en SQL, seule la base
 * connaît la valeur exacte. La quantité d'avant s'en déduit par le sens du
 * mouvement — à l'intérieur de la transaction, aucun tiers n'a pu s'intercaler.
 *
 * `ignoreDuplicates` s'appuie sur l'unicité de `cleIdempotence` : rejouer la
 * même opération (retry réseau, double clic) n'ajoute aucune ligne.
 *
 * @param {object}   p
 * @param {string}   p.commandeId
 * @param {string}   p.clientId    propriétaire de la commande
 * @param {'creation'|'annulation'|'rejet'} p.evenement
 * @param {string?}  p.auteurId    qui a déclenché l'opération
 * @param {Array<{produitId: string, quantite: number}>} p.lignes
 * @param {object}   transaction   transaction Sequelize en cours (obligatoire)
 */
async function tracerMouvementsCommande(
  { commandeId, clientId, evenement, auteurId = null, lignes = [] },
  transaction
) {
  const regle = EVENEMENTS_COMMANDE[evenement];
  if (!regle) throw new Error(`Évènement de stock inconnu : ${evenement}`);
  if (!lignes.length) return [];

  // Une seule lecture pour toutes les lignes, dans la transaction.
  const produits = await Produit.findAll({
    where: { id: lignes.map((l) => l.produitId) },
    attributes: ['id', 'stock'],
    transaction,
  });
  const stockParProduit = new Map(produits.map((p) => [p.id, Number(p.stock) || 0]));

  const aEcrire = lignes.map(({ produitId, quantite }) => {
    const bouge = regle.sens * Math.abs(Number(quantite) || 0);
    const nouvelleQuantite = stockParProduit.get(produitId) ?? 0;
    return {
      produitId,
      type: regle.type,
      source: regle.source,
      ancienneQuantite: nouvelleQuantite - bouge,
      nouvelleQuantite,
      difference: bouge,
      motif: null,
      commentaire: null,
      auteurId,
      commandeId,
      clientId,
      cleIdempotence: `commande:${commandeId}:${evenement}:${produitId}`,
    };
  });

  return MouvementStock.bulkCreate(aEcrire, { transaction, ignoreDuplicates: true });
}

/**
 * Trace un ajustement manuel décidé par l'administration, DANS la
 * transaction qui vient d'écrire la nouvelle quantité.
 *
 * Pas de clé d'idempotence : chaque ajustement est un acte volontaire et
 * distinct, deux corrections identiques le même jour sont légitimes.
 */
function tracerAjustementManuel(
  { produitId, ancienneQuantite, nouvelleQuantite, motif, commentaire = null, auteurId = null },
  transaction
) {
  const difference = nouvelleQuantite - ancienneQuantite;
  return MouvementStock.create(
    {
      produitId,
      type: typeAjustement(difference),
      source: SOURCE_MOUVEMENT_STOCK.AJUSTEMENT_ADMIN,
      ancienneQuantite,
      nouvelleQuantite,
      difference,
      motif,
      commentaire,
      auteurId,
      commandeId: null,
      clientId: null,
      cleIdempotence: null,
    },
    { transaction }
  );
}

module.exports = {
  tracerMouvementsCommande,
  tracerAjustementManuel,
  typeAjustement,
  EVENEMENTS_COMMANDE,
};
