'use strict';

const logger = require('../../config/logger');
const { METHODE_PAIEMENT } = require('../../constants');
const CashProvider = require('./providers/cash.provider');
const WaveProvider = require('./providers/wave.provider');
const OrangeMoneyProvider = require('./providers/orange.provider');

/**
 * Sélection du fournisseur de paiement.
 *
 * Fournisseurs:
 *   - cash_livraison : Paiement à la livraison (pas de tiers)
 *   - wave : Wave API (Sénégal/Afrique)
 *   - orange_money : Orange Money API (Afrique francophone)
 */

function resoudreFournisseur(methode) {
  try {
    switch (methode) {
      case METHODE_PAIEMENT.CASH_LIVRAISON:
        return new CashProvider(methode);

      case METHODE_PAIEMENT.WAVE:
        return new WaveProvider(methode);

      case METHODE_PAIEMENT.ORANGE_MONEY:
        return new OrangeMoneyProvider(methode);

      default:
        throw new Error(`Méthode de paiement non supportée: ${methode}`);
    }
  } catch (error) {
    logger.error('[Paiement] Erreur résolution fournisseur', {
      methode,
      error: error.message,
    });
    throw error;
  }
}

module.exports = { resoudreFournisseur };
