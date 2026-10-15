// ─────────────────────────────────────────────────────────────
// utils/statutCommande.js
// Statuts de commande internes à l'administration.
// ─────────────────────────────────────────────────────────────
//
// « en_modification » organise le travail de l'administration avant la
// validation (commande en cours de retouche : rupture, quantités…). Le client
// et le vendeur ne le voient jamais : pour eux, la commande est « en attente ».

const { STATUT_COMMANDE } = require('../constants');

const STATUTS_INTERNES = Object.freeze([STATUT_COMMANDE.EN_MODIFICATION]);

/** Statut montré au client et au vendeur. */
const statutPublic = (statut) =>
  STATUTS_INTERNES.includes(statut) ? STATUT_COMMANDE.EN_ATTENTE : statut;

/** Commande (instance Sequelize ou objet) au format client / vendeur. */
function commandePublique(commande) {
  if (!commande) return commande;
  const json = typeof commande.toJSON === 'function' ? commande.toJSON() : { ...commande };
  json.statut = statutPublic(json.statut);
  return json;
}

/**
 * Statuts réels correspondant à un statut demandé par le client ou le
 * vendeur : « en attente » couvre aussi les commandes en modification.
 */
const statutsReels = (statut) =>
  statut === STATUT_COMMANDE.EN_ATTENTE
    ? [STATUT_COMMANDE.EN_ATTENTE, ...STATUTS_INTERNES]
    : [statut];

module.exports = { STATUTS_INTERNES, statutPublic, commandePublique, statutsReels };
