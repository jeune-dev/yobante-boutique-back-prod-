'use strict';

/* eslint-disable require-await */

/**
 * Paiement à la livraison.
 *
 * Aucun tiers n'intervient : rien n'est encaissé en ligne. Le paiement reste
 * « en attente » jusqu'à ce que l'administration le confirme à la livraison,
 * via la route admin existante.
 */
class CashProvider {
  constructor(methode) {
    this.methode = methode;
    this.nom = 'cash_livraison';
  }

  async initier({ commande }) {
    return {
      reference: `CASH-${commande.reference}`,
      urlPaiement: null, // rien à ouvrir : le client paiera en main propre
      statut: 'en_attente',
      // La commande peut avancer sans attendre d'encaissement.
      confirmerCommande: true,
    };
  }

  async verifier({ paiement }) {
    return { reference: paiement.transactionId, statut: paiement.statut };
  }

  // Pas de callback entrant : l'encaissement est constaté par l'admin.
  verifierSignature() {
    return false;
  }
}

module.exports = CashProvider;
