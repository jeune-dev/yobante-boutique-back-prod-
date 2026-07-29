'use strict';

const { Commande, Paiement, User, sequelize } = require('../../models');
const { resoudreFournisseur } = require('../paiement');
const NotificationService = require('../notification');
const logger = require('../../config/logger');
const { STATUT_PAIEMENT, STATUT_COMMANDE } = require('../../constants');

/**
 * Paiement d'une commande côté client.
 *
 * `passerCommande` crée déjà le paiement en attente avec la méthode choisie ;
 * ce service en pilote l'exécution : initiation auprès du fournisseur, prise
 * en compte du callback, et réconciliation à la demande.
 */
class PaiementClientService {
  /** Statuts de commande pour lesquels un paiement n'a plus de sens. */
  static #estCloturee(commande) {
    return commande.statut === STATUT_COMMANDE.ANNULEE;
  }

  /**
   * Démarre le paiement et renvoie de quoi le poursuivre côté client.
   * Idempotent : relancer sur un paiement déjà réussi ne réencaisse rien.
   */
  static async initier(userId, commandeId, urlBase) {
    const commande = await Commande.findOne({
      where: { id: commandeId, userId },
      include: [
        { model: Paiement, as: 'paiement' },
        { model: User, as: 'user', attributes: ['id', 'email', 'prenom', 'nom', 'telephone'] },
      ],
    });
    if (!commande) return { success: false, status: 404, message: 'Commande introuvable' };
    if (this.#estCloturee(commande)) {
      return { success: false, status: 400, message: 'Cette commande est annulée' };
    }

    const paiement = commande.paiement;
    if (!paiement) {
      return { success: false, status: 400, message: 'Aucun paiement associé à cette commande' };
    }
    if (paiement.statut === STATUT_PAIEMENT.SUCCES) {
      return { success: false, status: 409, message: 'Cette commande est déjà payée' };
    }
    if (paiement.statut === STATUT_PAIEMENT.REMBOURSE) {
      return { success: false, status: 409, message: 'Ce paiement a été remboursé' };
    }

    const fournisseur = resoudreFournisseur(paiement.methode);
    const resultat = await fournisseur.initier({ paiement, commande, urlBase });

    await paiement.update({
      transactionId: resultat.reference,
      urlPaiement: resultat.urlPaiement,
      fournisseur: fournisseur.nom,
      statut: STATUT_PAIEMENT.EN_ATTENTE,
      derniereErreur: null,
    });

    return {
      success: true,
      message: resultat.urlPaiement
        ? 'Paiement initié'
        : 'Commande confirmée — paiement à la livraison',
      paiement: {
        id: paiement.id,
        methode: paiement.methode,
        statut: paiement.statut,
        montant: paiement.montant,
        reference: resultat.reference,
        urlPaiement: resultat.urlPaiement,
      },
    };
  }

  /** État courant du paiement, pour l'écran de suivi côté mobile. */
  static async statut(userId, commandeId) {
    const commande = await Commande.findOne({
      where: { id: commandeId, userId },
      include: [{ model: Paiement, as: 'paiement' }],
    });
    if (!commande || !commande.paiement) {
      return { success: false, status: 404, message: 'Paiement introuvable' };
    }

    const p = commande.paiement;
    return {
      success: true,
      paiement: {
        id: p.id,
        methode: p.methode,
        statut: p.statut,
        montant: p.montant,
        montantPaye: p.montantPaye,
        reference: p.transactionId,
        urlPaiement: p.urlPaiement,
        payeAt: p.payeAt,
        statutCommande: commande.statut,
      },
    };
  }

  /**
   * Prise en compte d'une notification du fournisseur.
   *
   * Transactionnel et idempotent : un fournisseur peut rejouer le même
   * callback plusieurs fois, et ne doit jamais produire deux encaissements ni
   * faire régresser un paiement déjà abouti.
   *
   * IMPORTANT: Un paiement n'est marqué SUCCES que si montantPaye >= montant
   */
  static async traiterCallback({ reference, succes, signature, corps }) {
    const paiement = await Paiement.findOne({
      where: { transactionId: reference },
      include: [{ model: Commande, as: 'commande', attributes: ['id', 'reference'] }],
    });

    if (!paiement) {
      logger.warn('[Callback] Transaction inconnue', { reference });
      return { success: false, status: 404, message: 'Transaction inconnue' };
    }

    const fournisseur = resoudreFournisseur(paiement.methode);

    if (!fournisseur.verifierSignature({ signature, corps })) {
      logger.warn('[Callback] Signature invalide', { reference, fournisseur: paiement.methode });
      return { success: false, status: 401, message: 'Signature invalide' };
    }

    if (paiement.statut === STATUT_PAIEMENT.SUCCES) {
      logger.info('[Callback] Paiement déjà confirmé (idempotence)', { reference });
      return { success: true, message: 'Paiement déjà confirmé', paiement };
    }

    const callbackData = fournisseur.extraireCallbackData(corps);

    await sequelize.transaction(async (t) => {
      const incremente = { tentatives: paiement.tentatives + 1 };

      if (succes && callbackData.succes) {
        const montantRecu = callbackData.montantRecu || callbackData.montantDemande;

        // VALIDATION CRITIQUE: Vérifier que le montant reçu >= montant attendu
        if (montantRecu < parseFloat(paiement.montant)) {
          logger.warn('[Callback] Montant partiel reçu', {
            reference,
            montantAttendu: paiement.montant,
            montantRecu,
          });

          await paiement.update(
            {
              montantPaye: montantRecu,
              statut: STATUT_PAIEMENT.EN_ATTENTE,
              derniereErreur: `Montant partiel: ${montantRecu} au lieu de ${paiement.montant}`,
              codeErreur: 'PARTIAL_PAYMENT',
              ...incremente,
            },
            { transaction: t }
          );

          return;
        }

        // Montant exact ou supérieur: marquer comme payé
        await paiement.update(
          {
            statut: STATUT_PAIEMENT.SUCCES,
            montantPaye: montantRecu,
            payeAt: new Date(),
            derniereErreur: null,
            codeErreur: null,
            ...incremente,
          },
          { transaction: t }
        );

        logger.info('[Callback] Paiement accepté', {
          reference,
          montant: paiement.montant,
          montantRecu,
          fournisseur: paiement.methode,
        });
      } else {
        // Paiement refusé ou échoué
        await paiement.update(
          {
            statut: STATUT_PAIEMENT.ECHOUE,
            montantPaye: callbackData.montantRecu || 0,
            derniereErreur: callbackData.messageErreur || 'Paiement refusé par le fournisseur',
            codeErreur: callbackData.codeErreur || 'PAYMENT_FAILED',
            ...incremente,
          },
          { transaction: t }
        );

        logger.warn('[Callback] Paiement refusé', {
          reference,
          codeErreur: callbackData.codeErreur,
          messageErreur: callbackData.messageErreur,
        });
      }
    });

    await paiement.reload();

    const estPaye = paiement.statut === STATUT_PAIEMENT.SUCCES;
    const estPartiel = paiement.montantPaye > 0 && paiement.montantPaye < paiement.montant;

    await NotificationService.emettre({
      userId: paiement.userId,
      titre: estPaye
        ? 'Paiement confirmé'
        : estPartiel
          ? 'Paiement partiel reçu'
          : 'Paiement refusé',
      message: estPaye
        ? `Votre paiement de ${paiement.montant} FCFA a été confirmé.`
        : estPartiel
          ? `Paiement partiel: ${paiement.montantPaye} FCFA. Restant: ${paiement.montant - paiement.montantPaye} FCFA.`
          : `Paiement échoué. Motif: ${paiement.derniereErreur}. Réessayez depuis la commande.`,
      type: 'paiement',
      donnees: { commandeId: paiement.commandeId },
    });

    return {
      success: true,
      message: estPaye
        ? 'Paiement confirmé'
        : estPartiel
          ? 'Paiement partiel enregistré'
          : 'Paiement refusé',
      paiement,
    };
  }
}

module.exports = PaiementClientService;
