// ─────────────────────────────────────────────────────────────
// services/vendeur/abonnement.service.js — Abonnement mensuel du vendeur
// ─────────────────────────────────────────────────────────────
'use strict';

const { Op } = require('sequelize');
const { Abonnement, PaiementAbonnement, User, sequelize } = require('../../models');
const { resoudreFournisseur } = require('../paiement');
const NotificationService = require('../notification');
const logger = require('../../config/logger');

/** Tarif mensuel (FCFA) et durée d'une période, surchargeables par l'environnement. */
const TARIF = Number(process.env.ABONNEMENT_VENDEUR_MONTANT) || 5000;
const DUREE_JOURS = Number(process.env.ABONNEMENT_VENDEUR_DUREE_JOURS) || 30;
const TYPE = 'mensuel';
const METHODES = ['wave', 'orange_money'];

const ajouterJours = (date, jours) => new Date(date.getTime() + jours * 86400000);

/** Statut effectif : une période « active » dont la date de fin est passée est expirée. */
const statutEffectif = (abonnement) =>
  abonnement.statut === 'actif' && new Date(abonnement.dateFin) < new Date()
    ? 'expire'
    : abonnement.statut;

const formaterAbonnement = (abonnement) =>
  abonnement
    ? {
        id: abonnement.id,
        vendeurId: abonnement.vendeurId,
        type: abonnement.type,
        montant: abonnement.montant,
        dateDebut: abonnement.dateDebut,
        dateFin: abonnement.dateFin,
        statut: statutEffectif(abonnement),
      }
    : // Aucun abonnement encore souscrit : le mobile affiche le tarif à payer.
      {
        id: null,
        vendeurId: null,
        type: TYPE,
        montant: TARIF.toFixed(2),
        dateDebut: null,
        dateFin: null,
        statut: 'aucun',
      };

class AbonnementService {
  static get tarif() {
    return TARIF;
  }

  /** Période la plus récente du vendeur (la plus tardive), ou null. */
  static periodeCourante(vendeurId) {
    return Abonnement.findOne({
      where: { vendeurId, statut: { [Op.ne]: 'annule' } },
      order: [['dateFin', 'DESC']],
    });
  }

  static async monAbonnement(vendeurId) {
    const abonnement = await this.periodeCourante(vendeurId);
    return { success: true, abonnement: formaterAbonnement(abonnement) };
  }

  static async historiquePaiements(vendeurId) {
    const paiements = await PaiementAbonnement.findAll({
      where: { vendeurId },
      order: [['createdAt', 'DESC']],
    });
    return { success: true, paiements };
  }

  static async getPaiement(vendeurId, id) {
    const paiement = await PaiementAbonnement.findOne({ where: { id, vendeurId } });
    if (!paiement) return { success: false, status: 404, message: 'Paiement introuvable' };
    return { success: true, paiement };
  }

  /**
   * Démarre le paiement d'une période auprès du fournisseur mobile money.
   * Le montant est toujours le tarif serveur : celui envoyé par le client
   * n'est pas pris en compte.
   */
  static async initierPaiement(vendeurId, { methode = 'wave', numeroTelephone = null }, urlBase) {
    if (!METHODES.includes(methode)) {
      return { success: false, status: 400, message: 'Méthode de paiement non supportée' };
    }
    const vendeur = await User.findByPk(vendeurId, {
      attributes: ['id', 'email', 'prenom', 'nom', 'telephone'],
    });
    if (!vendeur) return { success: false, status: 404, message: 'Vendeur introuvable' };

    const enAttente = await PaiementAbonnement.findOne({
      where: { vendeurId, statut: 'en_attente', urlPaiement: { [Op.ne]: null } },
      order: [['createdAt', 'DESC']],
    });
    // Un paiement déjà initié et non conclu est réutilisé : pas de double encaissement.
    if (enAttente && enAttente.methode === methode) {
      return { success: true, message: 'Paiement en attente', paiement: enAttente };
    }

    const paiement = await PaiementAbonnement.create({
      vendeurId,
      montant: TARIF.toFixed(2),
      methode,
      numeroTelephone: numeroTelephone || vendeur.telephone || null,
    });

    const fournisseur = resoudreFournisseur(methode);
    // Les fournisseurs attendent la forme « commande » : une référence lisible
    // et l'utilisateur payeur suffisent.
    const resultat = await fournisseur.initier({
      paiement: {
        montant: paiement.montant,
        user: { ...vendeur.get(), telephone: paiement.numeroTelephone || vendeur.telephone },
      },
      commande: { reference: `ABO-${paiement.id.slice(0, 8).toUpperCase()}` },
      urlBase,
    });

    await paiement.update({
      transactionId: resultat.reference,
      urlPaiement: resultat.urlPaiement,
      fournisseur: fournisseur.nom,
    });

    return { success: true, message: 'Paiement initié', paiement };
  }

  /**
   * Callback du fournisseur pour un paiement d'abonnement. Renvoie
   * `status: 404` si la référence n'est pas un paiement d'abonnement, pour
   * laisser le contrôleur essayer les paiements de commande.
   */
  static async traiterCallback({ reference, succes, signature, corps }) {
    const paiement = await PaiementAbonnement.findOne({ where: { transactionId: reference } });
    if (!paiement) return { success: false, status: 404, message: 'Transaction inconnue' };

    const fournisseur = resoudreFournisseur(paiement.methode);
    if (!fournisseur.verifierSignature({ signature, corps })) {
      logger.warn('[Abonnement] Signature de callback invalide', { reference });
      return { success: false, status: 401, message: 'Signature invalide' };
    }
    if (paiement.statut === 'succes') {
      return { success: true, message: 'Paiement déjà confirmé', paiement };
    }

    const donnees = fournisseur.extraireCallbackData(corps);
    const montantRecu = donnees.montantRecu || donnees.montantDemande || 0;
    const accepte = succes && donnees.succes && montantRecu >= Number(paiement.montant);

    if (!accepte) {
      await paiement.update({
        statut: 'echoue',
        derniereErreur:
          donnees.messageErreur ||
          (montantRecu < Number(paiement.montant) ? 'Montant insuffisant' : 'Paiement refusé'),
      });
      return { success: true, message: 'Paiement refusé', paiement };
    }

    // Succès : la période courante est prolongée si elle court encore,
    // sinon une nouvelle période démarre maintenant.
    const abonnement = await sequelize.transaction(async (t) => {
      const courant = await this.periodeCourante(paiement.vendeurId);
      const maintenant = new Date();
      let periode;
      if (courant && courant.statut === 'actif' && new Date(courant.dateFin) > maintenant) {
        periode = await courant.update(
          { dateFin: ajouterJours(new Date(courant.dateFin), DUREE_JOURS) },
          { transaction: t }
        );
      } else {
        periode = await Abonnement.create(
          {
            vendeurId: paiement.vendeurId,
            type: TYPE,
            montant: paiement.montant,
            dateDebut: maintenant,
            dateFin: ajouterJours(maintenant, DUREE_JOURS),
            statut: 'actif',
          },
          { transaction: t }
        );
      }
      await paiement.update(
        { statut: 'succes', payeAt: maintenant, abonnementId: periode.id, derniereErreur: null },
        { transaction: t }
      );
      return periode;
    });

    await NotificationService.emettre({
      userId: paiement.vendeurId,
      titre: 'Abonnement renouvelé',
      message: `Votre abonnement est actif jusqu'au ${new Date(abonnement.dateFin).toLocaleDateString('fr-FR')}.`,
      type: 'abonnement',
      donnees: { abonnementId: abonnement.id },
    });

    return { success: true, message: 'Abonnement activé', paiement, abonnement };
  }
}

module.exports = AbonnementService;
