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
 * Les moments du cycle de vie où le stock change réellement, relevés dans le
 * code et non supposés :
 *
 *  - `commande_creation`     décrément à la création de la commande (statut
 *                            initial `en_attente`) — c'est là, et pas au
 *                            paiement ni à la validation, que la marchandise
 *                            quitte le stock ;
 *  - `commande_annulation`   remise en stock à l'annulation (client ou admin) ;
 *  - `commande_rejet`        remise en stock au rejet d'une commande en attente ;
 *  - `commande_modification` écart de quantité d'une ligne retouchée, et
 *                            retour intégral d'une ligne supprimée ;
 *  - `commande_rupture`      mise à zéro quand l'administration déclare le
 *                            produit en rupture ;
 *  - `retour_remise_en_stock` article retourné et remis à la vente ;
 *  - `retour_correction`     remise en stock annulée (elle avait été cochée
 *                            à tort) — le stock repart, ce n'est pas une vente.
 *
 * Les transitions `validee`, `en_preparation`, `expediee` et `livree` ne
 * touchent pas au stock : aucun mouvement n'y est écrit, sans quoi la même
 * sortie serait comptée deux fois.
 */
const SENS_PAR_SOURCE = Object.freeze({
  [SOURCE_MOUVEMENT_STOCK.COMMANDE_CREATION]: TYPE_MOUVEMENT_STOCK.SORTIE,
  [SOURCE_MOUVEMENT_STOCK.COMMANDE_ANNULATION]: TYPE_MOUVEMENT_STOCK.ENTREE,
  [SOURCE_MOUVEMENT_STOCK.COMMANDE_REJET]: TYPE_MOUVEMENT_STOCK.ENTREE,
  [SOURCE_MOUVEMENT_STOCK.COMMANDE_RUPTURE]: TYPE_MOUVEMENT_STOCK.AJUSTEMENT_NEGATIF,
  [SOURCE_MOUVEMENT_STOCK.RETOUR_REMISE_EN_STOCK]: TYPE_MOUVEMENT_STOCK.RETOUR,
  [SOURCE_MOUVEMENT_STOCK.RETOUR_CORRECTION]: TYPE_MOUVEMENT_STOCK.AJUSTEMENT_NEGATIF,
});

/** Type d'un ajustement manuel ou d'un écart, déduit du sens du mouvement. */
function typeAjustement(difference) {
  if (difference > 0) return TYPE_MOUVEMENT_STOCK.AJUSTEMENT_POSITIF;
  if (difference < 0) return TYPE_MOUVEMENT_STOCK.AJUSTEMENT_NEGATIF;
  return TYPE_MOUVEMENT_STOCK.AJUSTEMENT_NEUTRE;
}

/**
 * Type d'un mouvement : fixé par la source quand elle ne laisse aucun doute,
 * déduit du sens sinon. Une modification de commande peut aller dans les deux
 * sens (quantité augmentée = sortie, réduite = retour en stock), d'où le repli.
 */
function typeDuMouvement(source, difference) {
  const fixe = SENS_PAR_SOURCE[source];
  if (fixe) return fixe;
  if (source === SOURCE_MOUVEMENT_STOCK.COMMANDE_MODIFICATION) {
    return difference < 0 ? TYPE_MOUVEMENT_STOCK.SORTIE : TYPE_MOUVEMENT_STOCK.ENTREE;
  }
  return typeAjustement(difference);
}

/**
 * Trace un lot de mouvements DANS la transaction qui vient de modifier le
 * stock.
 *
 * Les quantités après coup sont relues en base plutôt que recalculées de
 * tête : la décrémentation se fait par `stock - n` en SQL, seule la base
 * connaît la valeur exacte. La quantité d'avant s'en déduit de l'écart — à
 * l'intérieur de la transaction, aucun tiers n'a pu s'intercaler.
 *
 * `ignoreDuplicates` s'appuie sur l'unicité de `cleIdempotence` : rejouer la
 * même opération (retry réseau, double clic) n'ajoute aucune ligne.
 *
 * @param {object} p
 * @param {string} p.source        une valeur de SOURCE_MOUVEMENT_STOCK
 * @param {Array<{produitId: string, difference: number}>} p.lignes
 *        `difference` est signée : négative pour une sortie de stock.
 * @param {string?} p.auteurId     qui a déclenché l'opération (jamais le corps
 *                                 de la requête : toujours le jeton vérifié)
 * @param {string?} p.commandeId
 * @param {string?} p.retourId
 * @param {string?} p.clientId
 * @param {(ligne: object) => (string|null)} p.cle  clé d'idempotence par ligne
 * @param {object} transaction     transaction Sequelize en cours (obligatoire)
 */
async function tracerMouvements(
  {
    source,
    lignes = [],
    auteurId = null,
    commandeId = null,
    retourId = null,
    clientId = null,
    motif = null,
    commentaire = null,
    cle = () => null,
  },
  transaction
) {
  if (!source) throw new Error('Source de mouvement de stock manquante');

  // Une ligne sans écart ne dit rien : on ne pollue pas l'historique.
  const utiles = lignes.filter((l) => Number(l.difference) !== 0);
  if (!utiles.length) return [];

  // Une seule lecture pour toutes les lignes, dans la transaction.
  const produits = await Produit.findAll({
    where: { id: utiles.map((l) => l.produitId) },
    attributes: ['id', 'stock'],
    transaction,
  });
  const stockParProduit = new Map(produits.map((p) => [p.id, Number(p.stock) || 0]));

  const aEcrire = utiles.map((ligne) => {
    const difference = Number(ligne.difference);
    const nouvelleQuantite = stockParProduit.get(ligne.produitId) ?? 0;
    return {
      produitId: ligne.produitId,
      type: typeDuMouvement(source, difference),
      source,
      ancienneQuantite: nouvelleQuantite - difference,
      nouvelleQuantite,
      difference,
      motif: ligne.motif ?? motif,
      commentaire: ligne.commentaire ?? commentaire,
      auteurId,
      commandeId,
      retourId,
      clientId,
      cleIdempotence: cle(ligne),
    };
  });

  return MouvementStock.bulkCreate(aEcrire, { transaction, ignoreDuplicates: true });
}

/**
 * Mouvements provoqués par une commande. `lignes` porte des quantités
 * positives ; `sens` dit si elles sortent (-1) ou reviennent (+1).
 */
function tracerMouvementsCommande(
  { commandeId, clientId, source, sens, auteurId = null, evenement, lignes = [] },
  transaction
) {
  return tracerMouvements(
    {
      source,
      auteurId,
      commandeId,
      clientId,
      lignes: lignes.map((l) => ({
        produitId: l.produitId,
        difference: sens * Math.abs(Number(l.quantite) || 0),
      })),
      cle: (l) => `commande:${commandeId}:${evenement}:${l.produitId}`,
    },
    transaction
  );
}

/**
 * Trace un ajustement manuel décidé par l'administration.
 *
 * Pas de clé d'idempotence : chaque ajustement est un acte volontaire et
 * distinct, deux corrections identiques le même jour sont légitimes. Le
 * double envoi est écarté côté formulaire (bouton désactivé pendant l'appel).
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
      retourId: null,
      clientId: null,
      cleIdempotence: null,
    },
    { transaction }
  );
}

/**
 * Trace le mouvement de stock d'un retour.
 *
 * La clé d'idempotence porte un rang : un retour peut légitimement être remis
 * en stock, décoché, puis recoché — trois mouvements réels. Une clé figée
 * aurait silencieusement avalé le troisième et laissé le stock bouger sans
 * trace. Le rang est compté dans la transaction, donc deux requêtes
 * concurrentes retomberaient sur la même clé et l'index unique trancherait.
 */
async function tracerMouvementRetour({ retour, remiseEnStock, auteurId = null }, transaction) {
  const rang = await MouvementStock.count({ where: { retourId: retour.id }, transaction });
  const source = remiseEnStock
    ? SOURCE_MOUVEMENT_STOCK.RETOUR_REMISE_EN_STOCK
    : SOURCE_MOUVEMENT_STOCK.RETOUR_CORRECTION;
  const quantite = Math.abs(Number(retour.quantite) || 0);

  return tracerMouvements(
    {
      source,
      auteurId,
      commandeId: retour.commandeId || null,
      retourId: retour.id,
      clientId: retour.userId || null,
      motif: retour.motif || null,
      commentaire: retour.motifDetail || null,
      lignes: [{ produitId: retour.produitId, difference: remiseEnStock ? quantite : -quantite }],
      cle: () => `retour:${retour.id}:${remiseEnStock ? 'remise' : 'correction'}:${rang}`,
    },
    transaction
  );
}

module.exports = {
  tracerMouvements,
  tracerMouvementsCommande,
  tracerAjustementManuel,
  tracerMouvementRetour,
  typeAjustement,
  typeDuMouvement,
};
