'use strict';

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../../config/logger');
const { AppError } = require('../../../errors/AppError');

/**
 * Intégration Wave - Fournisseur de paiement Sénégal/Afrique
 * Documentation: https://developer.wave.com/
 *
 * Flow:
 * 1. Initier une transaction → Wave retourne une URL de paiement
 * 2. Client paie sur l'URL Wave
 * 3. Wave envoie un callback pour confirmer le paiement
 */
class WaveProvider {
  constructor(methode) {
    this.methode = methode;
    this.nom = 'wave';
    this.apiKey = process.env.WAVE_API_KEY;
    this.apiSecret = process.env.WAVE_API_SECRET;
    this.baseUrl = process.env.WAVE_API_URL || 'https://api.wave.com/v1';

    if (!this.apiKey || !this.apiSecret) {
      throw new Error('WAVE_API_KEY et WAVE_API_SECRET sont requis');
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  /**
   * Initier un paiement auprès de Wave
   * @param {Object} paiement - Objet paiement de la DB
   * @param {Object} commande - Objet commande de la DB
   * @param {string} urlBase - URL publique du serveur
   * @returns {Promise<{reference, urlPaiement, statut}>}
   */
  async initier({ paiement, commande, urlBase }) {
    try {
      const reference = `WAV-${commande.reference}-${Date.now()}`;
      const callbackUrl = `${urlBase}/api/v1/paiements/callback`;
      const returnUrl = `${urlBase}/api/v1/paiements/wave/return/${reference}`;

      // Créer la transaction Wave
      const payload = {
        amount: parseFloat(paiement.montant),
        currency: 'XOF', // Franc CFA
        description: `Commande ${commande.reference} - Yobante Boutique`,
        external_id: reference,
        customer: {
          email: paiement.user?.email || 'client@yobante.com',
          first_name: paiement.user?.prenom || 'Client',
          last_name: paiement.user?.nom || 'Yobante',
          phone_number: paiement.user?.telephone || '',
        },
        return_url: returnUrl,
        // Wave enverra le callback à cette URL
        webhook_url: callbackUrl,
      };

      logger.info('[Wave] Initiation paiement', {
        reference,
        montant: paiement.montant,
        commande: commande.reference,
      });

      const response = await this.client.post('/charges', payload);

      if (!response.data || !response.data.id) {
        throw new Error('Wave: réponse invalide');
      }

      const chargeId = response.data.id;
      const paymentUrl =
        response.data.checkout_url || `${this.baseUrl}/charges/${chargeId}/checkout`;

      return {
        reference,
        chargeId,
        urlPaiement: paymentUrl,
        statut: 'en_attente',
        fournisseur: this.nom,
      };
    } catch (error) {
      logger.error('[Wave] Erreur initiation', {
        error: error.message,
        response: error.response?.data,
      });

      if (error.response?.status === 401) {
        throw new AppError('Clé Wave invalide', 503);
      }

      throw new AppError(
        `Erreur paiement Wave: ${error.response?.data?.message || error.message}`,
        503
      );
    }
  }

  /**
   * Vérifier l'état d'une transaction
   */
  async verifier({ paiement }) {
    try {
      if (!paiement.chargeId) {
        return {
          reference: paiement.transactionId,
          statut: paiement.statut,
          montantPaye: paiement.montantPaye,
        };
      }

      const response = await this.client.get(`/charges/${paiement.chargeId}`);

      return {
        reference: paiement.transactionId,
        statut: this.mapperStatut(response.data.status),
        montantPaye: response.data.amount_received || 0,
        chargeId: paiement.chargeId,
      };
    } catch (error) {
      logger.error('[Wave] Erreur vérification', {
        chargeId: paiement.chargeId,
        error: error.message,
      });

      return {
        reference: paiement.transactionId,
        statut: paiement.statut,
      };
    }
  }

  /**
   * Vérifier la signature du callback Wave
   * Wave signe les callbacks avec HMAC-SHA256
   */
  verifierSignature({ signature, corps }) {
    try {
      if (!signature) return false;

      // Créer la signature attendue
      const contenuAVerifier = JSON.stringify(corps);
      const signatureAttendue = crypto
        .createHmac('sha256', this.apiSecret)
        .update(contenuAVerifier)
        .digest('hex');

      // Comparaison timing-safe pour éviter les timing attacks
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(signatureAttendue));
    } catch (error) {
      logger.warn('[Wave] Erreur vérification signature', { error: error.message });
      return false;
    }
  }

  /**
   * Mapper les statuts Wave vers nos statuts internes
   */
  mapperStatut(waveStatus) {
    const mapping = {
      succeeded: 'succes',
      completed: 'succes',
      failed: 'echoue',
      cancelled: 'echoue',
      pending: 'en_attente',
      refunded: 'rembourse',
    };

    return mapping[waveStatus] || 'en_attente';
  }

  /**
   * Extraire les informations de paiement du callback Wave
   */
  extraireCallbackData(corps) {
    return {
      reference: corps.external_id,
      chargeId: corps.id,
      statut: this.mapperStatut(corps.status),
      montantDemande: parseFloat(corps.amount),
      montantRecu: parseFloat(corps.amount_received) || 0,
      succes: corps.status === 'succeeded' || corps.status === 'completed',
      codeErreur: corps.error_code || null,
      messageErreur: corps.error_message || null,
      timestamp: corps.created_at,
    };
  }

  /**
   * Traiter un remboursement
   */
  async rembourser({ paiement, montantRemboursement }) {
    try {
      if (!paiement.chargeId) {
        throw new AppError('Pas de chargeId pour effectuer un remboursement', 400);
      }

      logger.info('[Wave] Remboursement', {
        chargeId: paiement.chargeId,
        montant: montantRemboursement,
      });

      const response = await this.client.post(`/charges/${paiement.chargeId}/refund`, {
        amount: montantRemboursement,
        reason: 'Annulation commande',
      });

      return {
        success: true,
        refundId: response.data.refund_id,
        montantRemboursePaye: montantRemboursement,
      };
    } catch (error) {
      logger.error('[Wave] Erreur remboursement', {
        chargeId: paiement.chargeId,
        error: error.message,
      });

      throw new AppError(
        `Erreur remboursement Wave: ${error.response?.data?.message || error.message}`,
        503
      );
    }
  }
}

module.exports = WaveProvider;
