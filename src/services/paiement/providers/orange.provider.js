'use strict';

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../../config/logger');
const { AppError } = require('../../../errors/AppError');

/**
 * Intégration Orange Money - Fournisseur de paiement Afrique
 * Documentation: https://orange.cm/business/orangemoney/
 *
 * Flow:
 * 1. Initier une transaction via API Orange Money
 * 2. Client paie via USSD ou application Orange Money
 * 3. Orange envoie un callback pour confirmer le paiement
 */
class OrangeMoneyProvider {
  constructor(methode) {
    this.methode = methode;
    this.nom = 'orange_money';
    this.apiKey = process.env.ORANGE_MONEY_API_KEY;
    this.apiSecret = process.env.ORANGE_MONEY_API_SECRET;
    this.merchantId = process.env.ORANGE_MONEY_MERCHANT_ID;
    this.baseUrl = process.env.ORANGE_MONEY_API_URL || 'https://api.orange.com/orangemoney';

    if (!this.apiKey || !this.apiSecret || !this.merchantId) {
      throw new Error(
        'ORANGE_MONEY_API_KEY, ORANGE_MONEY_API_SECRET et ORANGE_MONEY_MERCHANT_ID sont requis'
      );
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
    });
  }

  /**
   * Générer la signature pour les requêtes Orange Money
   */
  genererSignature(data) {
    const contenu = `${JSON.stringify(data)}${this.apiSecret}`;
    return crypto.createHash('sha256').update(contenu).digest('hex');
  }

  /**
   * Initier un paiement auprès d'Orange Money
   */
  async initier({ paiement, commande, urlBase }) {
    try {
      const reference = `OM-${commande.reference}-${Date.now()}`;
      const callbackUrl = `${urlBase}/api/v1/paiements/callback`;

      const payload = {
        merchant_id: this.merchantId,
        order_id: reference,
        amount: Math.round(parseFloat(paiement.montant) * 100), // Centimes
        currency: 'XOF',
        description: `Commande ${commande.reference} - Yobante`,
        customer_email: paiement.user?.email || 'client@yobante.com',
        customer_phone: paiement.user?.telephone || '',
        return_url: `${urlBase}/api/v1/paiements/orange/return/${reference}`,
        notify_url: callbackUrl,
        language: 'fr',
      };

      // Ajouter la signature
      const signature = this.genererSignature(payload);
      payload.signature = signature;

      logger.info('[Orange Money] Initiation paiement', {
        reference,
        montant: paiement.montant,
        commande: commande.reference,
      });

      const response = await this.client.post('/payment/initiate', payload, {
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.data || response.data.status !== 'success') {
        throw new Error(`Orange Money: ${response.data?.message || 'Erreur initiation'}`);
      }

      const paymentUrl =
        response.data.payment_url || `${this.baseUrl}/payment/${response.data.transaction_id}`;

      return {
        reference,
        transactionId: response.data.transaction_id,
        urlPaiement: paymentUrl,
        statut: 'en_attente',
        fournisseur: this.nom,
      };
    } catch (error) {
      logger.error('[Orange Money] Erreur initiation', {
        error: error.message,
        response: error.response?.data,
      });

      if (error.response?.status === 401) {
        throw new AppError('Clé Orange Money invalide', 503);
      }

      throw new AppError(
        `Erreur paiement Orange Money: ${error.response?.data?.message || error.message}`,
        503
      );
    }
  }

  /**
   * Vérifier l'état d'une transaction
   */
  async verifier({ paiement }) {
    try {
      if (!paiement.transactionId) {
        return {
          reference: paiement.transactionId,
          statut: paiement.statut,
          montantPaye: paiement.montantPaye,
        };
      }

      const signature = this.genererSignature({
        transaction_id: paiement.transactionId,
      });

      const response = await this.client.get(`/payment/status/${paiement.transactionId}`, {
        params: { signature },
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      return {
        reference: paiement.transactionId,
        statut: this.mapperStatut(response.data.status),
        montantPaye: response.data.amount_paid / 100, // Convertir de centimes
        transactionId: paiement.transactionId,
      };
    } catch (error) {
      logger.error('[Orange Money] Erreur vérification', {
        transactionId: paiement.transactionId,
        error: error.message,
      });

      return {
        reference: paiement.transactionId,
        statut: paiement.statut,
      };
    }
  }

  /**
   * Vérifier la signature du callback Orange Money
   */
  verifierSignature({ signature, corps }) {
    try {
      if (!signature) return false;

      const signatureAttendue = this.genererSignature(corps);

      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(signatureAttendue));
    } catch (error) {
      logger.warn('[Orange Money] Erreur vérification signature', {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Mapper les statuts Orange Money vers nos statuts internes
   */
  mapperStatut(omStatus) {
    const mapping = {
      PAID: 'succes',
      COMPLETED: 'succes',
      FAILED: 'echoue',
      CANCELLED: 'echoue',
      PENDING: 'en_attente',
      REFUNDED: 'rembourse',
    };

    return mapping[omStatus] || 'en_attente';
  }

  /**
   * Extraire les informations de paiement du callback Orange Money
   */
  extraireCallbackData(corps) {
    return {
      reference: corps.order_id,
      transactionId: corps.transaction_id,
      statut: this.mapperStatut(corps.status),
      montantDemande: parseFloat(corps.amount) / 100,
      montantRecu: parseFloat(corps.amount_paid) / 100 || 0,
      succes: corps.status === 'PAID' || corps.status === 'COMPLETED',
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
      if (!paiement.transactionId) {
        throw new AppError('Pas de transactionId pour effectuer un remboursement', 400);
      }

      logger.info('[Orange Money] Remboursement', {
        transactionId: paiement.transactionId,
        montant: montantRemboursement,
      });

      const payload = {
        transaction_id: paiement.transactionId,
        amount: Math.round(montantRemboursement * 100), // Centimes
        reason: 'CANCELLATION',
      };

      const signature = this.genererSignature(payload);
      payload.signature = signature;

      const response = await this.client.post('/payment/refund', payload, {
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (response.data.status !== 'success') {
        throw new Error(`Remboursement échoué: ${response.data.message}`);
      }

      return {
        success: true,
        refundId: response.data.refund_id,
        montantRemboursePaye: montantRemboursement,
      };
    } catch (error) {
      logger.error('[Orange Money] Erreur remboursement', {
        transactionId: paiement.transactionId,
        error: error.message,
      });

      throw new AppError(
        `Erreur remboursement Orange Money: ${error.response?.data?.message || error.message}`,
        503
      );
    }
  }
}

module.exports = OrangeMoneyProvider;
