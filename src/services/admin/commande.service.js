// ─────────────────────────────────────────────────────────────
// services/admin/commande.service.js
// ─────────────────────────────────────────────────────────────
const { Op } = require('sequelize');
const {
  Commande,
  CommandeItem,
  Produit,
  User,
  Adresse,
  Paiement,
  AcceptationCommande,
  sequelize,
} = require('../../models');
const paginate = require('../../utils/paginate');
const { sendCommandeStatut, sendRuptureStock } = require('../../utils/mailer');
const { toCsv } = require('../../utils/csv');
const {
  ROLES,
  STATUT_COMMANDE,
  ORIGINE_ACTION,
  RESPONSABILITE,
  STATUT_RETOUR,
} = require('../../constants');
const CommandeService = require('../client/commande.service');
const NotificationService = require('../notification');
const logger = require('../../config/logger');

// La liste n'affiche que ces champs du produit : inutile de charger toute la
// fiche (description, images…) pour chaque ligne de chaque commande.
const PRODUIT_LISTE = ['id', 'nom', 'prix', 'reference', 'vendeurId'];

/**
 * Statuts que l'administration peut donner à une commande, selon son statut
 * actuel. « en_modification » (interne, avant la validation) organise le
 * travail : le client et le vendeur continuent de voir « en attente ».
 * Le rejet et l'annulation ont leurs propres actions (motif obligatoire).
 */
const TRANSITIONS_ADMIN = Object.freeze({
  en_attente: ['en_modification', 'validee'],
  en_modification: ['en_attente', 'validee'],
  validee: ['en_preparation'],
  en_preparation: ['expediee'],
  expediee: ['livree'],
});

/** Message envoyé au client pour chaque statut qu'il voit. */
const MESSAGES_STATUT = Object.freeze({
  validee: { titre: 'Commande validée', texte: 'a été validée' },
  en_preparation: { titre: 'Commande en préparation', texte: 'est en cours de préparation' },
  expediee: { titre: 'Commande expédiée', texte: 'a été expédiée' },
  livree: { titre: 'Commande livrée', texte: 'a été livrée' },
});

class GestionCommandeService {
  /**
   * Création d'une commande par un administrateur pour le compte d'un client.
   * Seules les vérifications propres à l'admin sont ici (le client existe, est
   * un CLIENT actif) ; tout le reste — prix, stock, frais, statut initial,
   * paiement, transaction — est la logique commune de CommandeService.
   * Le panier en base du client n'est ni lu ni vidé.
   */
  static async creerCommandeAdmin(adminId, { userId, ...donnees }) {
    const client = await User.findOne({
      where: { id: userId, role: ROLES.CLIENT },
      attributes: ['id', 'isActive'],
    });
    if (!client) return { success: false, status: 404, message: 'Client introuvable' };
    if (!client.isActive) {
      return {
        success: false,
        status: 400,
        message: 'Ce client est désactivé : impossible de lui créer une commande',
      };
    }

    const result = await CommandeService.creerCommande(userId, donnees, {
      depuisPanier: false,
      viderPanier: false,
      origine: 'admin',
      auteurId: adminId,
    });
    if (result.success) result.message = 'Commande créée avec succès';
    return result;
  }

  static async getAllCommandes({ page, limit, statut, userId, reference, search } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);

    const where = {};
    if (statut) where.statut = statut;
    if (userId) where.userId = userId;
    if (reference) where.reference = reference;
    // Le champ « Rechercher » de l'écran Commandes envoie `search`.
    if (search && String(search).trim()) {
      where.reference = { [Op.iLike]: `%${String(search).trim()}%` };
    }

    const { count, rows } = await Commande.scope('administration').findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email'] },
        {
          model: CommandeItem,
          as: 'items',
          include: [{ model: Produit, as: 'produit', attributes: PRODUIT_LISTE }],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: l,
      offset,
      // Sans `distinct`, le total compte les lignes jointes (une par article).
      distinct: true,
    });

    // Vendeurs concernés par chaque commande, avec leur réponse (disponible,
    // indisponible + motif, ou pas encore répondu) : la liste l'affiche sans
    // ouvrir chaque commande.
    const vendeursPar = await GestionCommandeService._vendeursDesCommandes(rows);

    return {
      success: true,
      commandes: rows.map((c) => {
        const vendeurs = vendeursPar.get(c.id) ?? [];
        return {
          ...c.toJSON(),
          vendeurs,
          refusVendeurs: vendeurs.filter((v) => v.statut === 'refusee').length,
        };
      }),
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  /**
   * Vendeurs de chaque commande de la liste et leur réponse.
   * @returns {Promise<Map<string, Array>>} id commande → vendeurs
   */
  static async _vendeursDesCommandes(commandes) {
    const resultat = new Map();
    if (!commandes.length) return resultat;

    const vendeurIds = new Set();
    for (const c of commandes) {
      for (const i of c.items || []) if (i.produit?.vendeurId) vendeurIds.add(i.produit.vendeurId);
    }
    if (!vendeurIds.size) return resultat;

    const [vendeurs, decisions] = await Promise.all([
      User.findAll({
        where: { id: { [Op.in]: [...vendeurIds] } },
        attributes: ['id', 'nom', 'prenom', 'telephone'],
        include: [{ association: 'profilVendeur', attributes: ['nomBoutique'] }],
      }),
      AcceptationCommande.findAll({
        where: { commandeId: { [Op.in]: commandes.map((c) => c.id) } },
        attributes: ['commandeId', 'vendeurId', 'statut', 'motifRefus', 'decideLe'],
        raw: true,
      }),
    ]);
    const vendeurPar = new Map(vendeurs.map((v) => [v.id, v]));
    const decisionPar = new Map(decisions.map((d) => [`${d.commandeId}:${d.vendeurId}`, d]));

    for (const c of commandes) {
      const ids = [...new Set((c.items || []).map((i) => i.produit?.vendeurId).filter(Boolean))];
      resultat.set(
        c.id,
        ids.map((vendeurId) => {
          const v = vendeurPar.get(vendeurId);
          const d = decisionPar.get(`${c.id}:${vendeurId}`);
          return {
            vendeurId,
            vendeur: [v?.prenom, v?.nom].filter(Boolean).join(' ') || null,
            boutique: v?.profilVendeur?.nomBoutique ?? null,
            telephone: v?.telephone ?? null,
            statut: d?.statut ?? 'en_attente',
            motifRefus: d?.motifRefus ?? null,
            decideLe: d?.decideLe ?? null,
          };
        })
      );
    }
    return resultat;
  }

  /**
   * Réponse de chaque vendeur concerné par la commande : produits disponibles
   * (acceptee), indisponibles avec le motif (refusee), ou pas encore répondu.
   */
  static async getDisponibilitesVendeurs(commandeId) {
    const lignes = await CommandeItem.findAll({
      where: { commandeId },
      attributes: ['quantite'],
      include: [{ model: Produit, as: 'produit', attributes: ['id', 'nom', 'vendeurId'] }],
    });
    const produitsPar = new Map();
    const produitIdsPar = new Map();
    for (const l of lignes) {
      const vendeurId = l.produit?.vendeurId;
      if (!vendeurId) continue;
      if (!produitsPar.has(vendeurId)) produitsPar.set(vendeurId, []);
      produitsPar.get(vendeurId).push(`${l.quantite} × ${l.produit.nom}`);
      if (!produitIdsPar.has(vendeurId)) produitIdsPar.set(vendeurId, []);
      produitIdsPar.get(vendeurId).push(l.produit.id);
    }
    const ids = [...produitsPar.keys()];
    if (!ids.length) return [];

    const [vendeurs, decisions] = await Promise.all([
      User.findAll({
        where: { id: { [Op.in]: ids } },
        attributes: ['id', 'nom', 'prenom', 'telephone'],
        include: [{ association: 'profilVendeur', attributes: ['nomBoutique'] }],
      }),
      AcceptationCommande.findAll({
        where: { commandeId, vendeurId: { [Op.in]: ids } },
        attributes: ['vendeurId', 'statut', 'motifRefus', 'decideLe'],
        raw: true,
      }),
    ]);
    const vendeurPar = new Map(vendeurs.map((v) => [v.id, v]));
    const decisionPar = new Map(decisions.map((d) => [d.vendeurId, d]));

    return ids.map((vendeurId) => {
      const v = vendeurPar.get(vendeurId);
      const d = decisionPar.get(vendeurId);
      return {
        vendeurId,
        vendeur: [v?.prenom, v?.nom].filter(Boolean).join(' ') || null,
        boutique: v?.profilVendeur?.nomBoutique ?? null,
        telephone: v?.telephone ?? null,
        produits: produitsPar.get(vendeurId),
        produitIds: produitIdsPar.get(vendeurId),
        statut: d?.statut ?? 'en_attente',
        motifRefus: d?.motifRefus ?? null,
        decideLe: d?.decideLe ?? null,
      };
    });
  }

  static async getCommandeById(id) {
    const commande = await Commande.scope('administration').findByPk(id, {
      include: [
        // Jamais le hash du mot de passe dans une réponse.
        { model: User, as: 'user', attributes: { exclude: ['password'] } },
        { model: Adresse, as: 'adresse' },
        {
          model: CommandeItem,
          as: 'items',
          include: [{ model: Produit, as: 'produit', attributes: { exclude: ['prixAchat'] } }],
        },
        { model: Paiement, as: 'paiement' },
      ],
    });

    if (!commande) {
      return { success: false, message: 'Commande introuvable' };
    }

    return { success: true, commande };
  }

  /**
   * Change le statut d'une commande et prévient le client (notification push,
   * notification dans l'application, email) — sauf pour un statut interne,
   * qu'il ne voit pas.
   */
  static async _transition(id, statutAttendu, nouveauStatut, extra = {}) {
    const commande = await Commande.scope('administration').findByPk(id, {
      include: [{ model: User, as: 'user' }],
    });
    if (!commande) {
      return { success: false, status: 404, message: 'Commande introuvable' };
    }

    const attendus = [].concat(statutAttendu || []);
    if (attendus.length && !attendus.includes(commande.statut)) {
      return {
        success: false,
        message: `La commande doit être en statut "${attendus.join('" ou "')}" pour cette action`,
      };
    }

    await commande.update({ statut: nouveauStatut, ...extra });

    const annonce = MESSAGES_STATUT[nouveauStatut];
    if (annonce) {
      await GestionCommandeService._notifierClient(commande, {
        titre: annonce.titre,
        message: `Votre commande ${commande.reference} ${annonce.texte}.`,
        type: `commande_${nouveauStatut}`,
        statutEmail: nouveauStatut,
      });
    }

    return { success: true, message: 'Commande mise à jour avec succès', commande };
  }

  /** Statuts proposés à l'administration pour une commande dans ce statut. */
  static statutsPossibles(statut) {
    return TRANSITIONS_ADMIN[statut] ?? [];
  }

  /**
   * Changement de statut depuis la fiche commande de l'administration.
   * Le client est prévenu par tous les canaux, sauf pour « en modification »
   * (interne) et le retour « en attente » qui le suit (il n'a rien vu changer).
   */
  static async changerStatut(id, statut, { note } = {}) {
    const commande = await Commande.scope('administration').findByPk(id, {
      attributes: ['id', 'statut'],
    });
    if (!commande) return { success: false, status: 404, message: 'Commande introuvable' };

    const possibles = GestionCommandeService.statutsPossibles(commande.statut);
    if (!possibles.includes(statut)) {
      return {
        success: false,
        status: 400,
        message: `Une commande « ${commande.statut} » ne peut pas passer en « ${statut} »`,
      };
    }
    const extra = note?.trim() ? { noteAdmin: note.trim() } : {};
    return GestionCommandeService._transition(id, commande.statut, statut, extra);
  }

  static validerCommande(id, noteAdmin) {
    return GestionCommandeService._transition(
      id,
      [STATUT_COMMANDE.EN_ATTENTE, STATUT_COMMANDE.EN_MODIFICATION],
      STATUT_COMMANDE.VALIDEE,
      noteAdmin ? { noteAdmin } : {}
    );
  }

  /**
   * Même règle métier que CommandeService.rejeterCommande : seule une commande
   * en attente peut être rejetée ; elle passe en `rejetee`, le motif va dans
   * `motifRejet` (affiché au client par le mobile) et le stock est restauré.
   */
  static async rejeterCommande(id, motif) {
    const result = await CommandeService.rejeterCommande(id, { motif });
    if (!result.success) return result;

    // Client prévenu par tous les canaux, avec le motif.
    const user = await User.findByPk(result.commande.userId, { attributes: ['email'] });
    await GestionCommandeService._notifierClient(
      { ...(result.commande.get?.({ plain: true }) ?? result.commande), user },
      {
        titre: 'Commande rejetée',
        message: `Votre commande ${result.commande.reference} a été rejetée.${
          motif ? ` Motif : ${motif}` : ''
        }`,
        type: 'commande_rejetee',
        statutEmail: STATUT_COMMANDE.REJETEE,
      }
    );

    return result;
  }

  static mettreEnPreparation(id) {
    return GestionCommandeService._transition(id, 'validee', 'en_preparation');
  }

  static marquerExpediee(id, trackingInfo) {
    return GestionCommandeService._transition(
      id,
      'en_preparation',
      'expediee',
      trackingInfo ? { noteAdmin: trackingInfo } : {}
    );
  }

  static marquerLivree(id) {
    return GestionCommandeService._transition(id, 'expediee', 'livree');
  }

  /**
   * Annule une commande à n'importe quelle étape de son cycle.
   *
   * Complète `rejeterCommande`, qui ne vaut que pour une commande en attente :
   * ici une commande déjà validée, en préparation ou expédiée peut être
   * interrompue. Une commande **livrée** est en revanche refusée — ce n'est
   * plus une annulation mais un retour (voir RetourService).
   *
   * Le motif et la responsabilité sont conservés : une annulation imputable au
   * vendeur (stock annoncé à tort) pèse sur sa fiabilité, un changement d'avis
   * du client non.
   */
  static async annulerCommande(id, { motif, responsabilite, vendeurResponsableId, adminId } = {}) {
    if (!motif?.trim()) {
      return { success: false, status: 400, message: "Le motif d'annulation est obligatoire" };
    }
    if (responsabilite && !Object.values(RESPONSABILITE).includes(responsabilite)) {
      return { success: false, status: 400, message: 'Responsabilité inconnue' };
    }

    const commande = await Commande.scope('administration').findByPk(id, {
      include: [
        { model: CommandeItem, as: 'items' },
        { model: User, as: 'user', attributes: ['id', 'email'] },
      ],
    });
    if (!commande) return { success: false, status: 404, message: 'Commande introuvable' };

    if (commande.statut === STATUT_COMMANDE.LIVREE) {
      return {
        success: false,
        status: 400,
        message: 'Une commande livrée ne s’annule pas : enregistrez un retour produit',
      };
    }
    if ([STATUT_COMMANDE.ANNULEE, STATUT_COMMANDE.REJETEE].includes(commande.statut)) {
      return { success: false, status: 400, message: 'Cette commande est déjà clôturée' };
    }

    // Responsabilité vendeur sans vendeur nommé : on prend celui du premier
    // article, cas de la commande mono-boutique qui est la norme ici.
    let responsable = vendeurResponsableId || null;
    if (responsabilite === RESPONSABILITE.VENDEUR && !responsable) {
      const premier = await Produit.scope('administration').findByPk(commande.items[0]?.produitId, {
        attributes: ['vendeurId'],
      });
      responsable = premier?.vendeurId || null;
    }

    const statutAvant = commande.statut;
    const transaction = await sequelize.transaction();
    try {
      // Mise à jour conditionnelle : si un double clic a déjà annulé la
      // commande, rien n'est modifié et le stock n'est pas recrédité deux fois.
      const [modifiees] = await Commande.update(
        {
          statut: STATUT_COMMANDE.ANNULEE,
          motifAnnulation: motif.trim(),
          annulePar: ORIGINE_ACTION.ADMIN,
          responsabiliteAnnulation: responsabilite || null,
          vendeurResponsableId: responsable,
          annuleeAt: new Date(),
          // Qui a annulé : `annulePar` dit le rôle, `modifieePar` l'identité.
          modifieePar: adminId || null,
          // L'annulation entre aussi au journal, pour que l'historique d'une
          // commande se lise d'un seul endroit.
          historiqueModifications: [
            ...(commande.historiqueModifications || []),
            {
              date: new Date().toISOString(),
              parQui: ORIGINE_ACTION.ADMIN,
              adminId: adminId || null,
              motif: motif.trim(),
              responsabilite: responsabilite || null,
              changements: [
                { champ: 'statut', avant: statutAvant, apres: STATUT_COMMANDE.ANNULEE },
              ],
            },
          ],
        },
        { where: { id, statut: statutAvant }, transaction }
      );
      if (modifiees === 0) {
        await transaction.rollback();
        return { success: false, status: 409, message: 'Commande déjà clôturée entre-temps' };
      }

      await Promise.all(
        commande.items.map((item) =>
          Produit.increment('stock', {
            by: item.quantite,
            where: { id: item.produitId },
            transaction,
          })
        )
      );
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    // Le client reçoit une formulation neutre, jamais le motif réel : celui-ci
    // est une information interne (défaillance vendeur, arbitrage commercial…)
    // qui sert au suivi de fiabilité, pas à la relation client. Il reste
    // enregistré en base et visible du seul dashboard.
    await GestionCommandeService._notifierClient(commande, {
      titre: 'Commande annulée',
      message: `Votre commande ${commande.reference} a été annulée : un ou plusieurs articles ne sont plus disponibles.`,
      type: 'commande_annulee',
      statutEmail: STATUT_COMMANDE.ANNULEE,
    });

    const rechargee = await GestionCommandeService.getCommandeById(id);
    return { success: true, message: 'Commande annulée', commande: rechargee.commande };
  }

  /**
   * Modifie une commande en cours : lignes, note, date de livraison souhaitée.
   *
   * `items` remplace les lignes existantes. L'écart de quantité est reporté
   * sur le stock article par article, et chaque retouche est journalisée dans
   * `historiqueModifications` — c'est ce journal qui permet de justifier un
   * écart de montant auprès du client et de suivre la fiabilité du vendeur.
   */
  static async modifierCommande(
    id,
    {
      items,
      note,
      dateLivraisonSouhaitee,
      motif,
      responsabilite,
      vendeurResponsableId,
      adminId,
    } = {}
  ) {
    if (!motif?.trim()) {
      return { success: false, status: 400, message: 'Le motif de modification est obligatoire' };
    }
    if (responsabilite && !Object.values(RESPONSABILITE).includes(responsabilite)) {
      return { success: false, status: 400, message: 'Responsabilité inconnue' };
    }

    const commande = await Commande.scope('administration').findByPk(id, {
      include: [
        { model: CommandeItem, as: 'items' },
        { model: User, as: 'user', attributes: ['id', 'email'] },
      ],
    });
    if (!commande) return { success: false, status: 404, message: 'Commande introuvable' };

    if (
      [STATUT_COMMANDE.LIVREE, STATUT_COMMANDE.ANNULEE, STATUT_COMMANDE.REJETEE].includes(
        commande.statut
      )
    ) {
      return {
        success: false,
        status: 400,
        message: 'Une commande livrée, annulée ou rejetée ne peut plus être modifiée',
      };
    }

    const changements = [];
    const transaction = await sequelize.transaction();
    try {
      if (Array.isArray(items) && items.length) {
        const ancienne = new Map(commande.items.map((i) => [i.produitId, i]));
        const produitIds = [...new Set(items.map((i) => i.produitId))];

        const produits = await Produit.scope('administration').findAll({
          where: { id: produitIds },
          attributes: ['id', 'nom', 'prix', 'prixPromo', 'stock'],
          transaction,
        });
        const parId = new Map(produits.map((p) => [p.id, p]));

        const manquant = produitIds.find((pid) => !parId.has(pid));
        if (manquant) {
          await transaction.rollback();
          return { success: false, status: 404, message: `Produit introuvable : ${manquant}` };
        }

        // Contrôle de stock avant toute écriture : on refuse l'ensemble de la
        // modification plutôt que d'en appliquer la moitié.
        for (const ligne of items) {
          const produit = parId.get(ligne.produitId);
          const avant = Number(ancienne.get(ligne.produitId)?.quantite) || 0;
          const delta = Number(ligne.quantite) - avant;
          if (delta > 0 && produit.stock < delta) {
            await transaction.rollback();
            return {
              success: false,
              status: 400,
              message: `Stock insuffisant pour ${produit.nom} : ${produit.stock} disponible(s)`,
            };
          }
        }

        // Lignes retirées : stock rendu intégralement.
        for (const [produitId, ligne] of ancienne) {
          if (!items.some((i) => i.produitId === produitId)) {
            await Produit.increment('stock', {
              by: ligne.quantite,
              where: { id: produitId },
              transaction,
            });
            changements.push({
              champ: 'ligne_retiree',
              produitId,
              avant: ligne.quantite,
              apres: 0,
            });
            await ligne.destroy({ transaction });
          }
        }

        let montantArticles = 0;
        for (const ligne of items) {
          const produit = parId.get(ligne.produitId);
          const prixUnitaire = Number(produit.prixPromo ?? produit.prix);
          const quantite = Number(ligne.quantite);
          const sousTotal = Number((prixUnitaire * quantite).toFixed(2));
          montantArticles += sousTotal;

          const existante = ancienne.get(ligne.produitId);
          const avant = Number(existante?.quantite) || 0;
          const delta = quantite - avant;

          if (delta !== 0) {
            await Produit.increment('stock', {
              by: -delta,
              where: { id: ligne.produitId },
              transaction,
            });
            changements.push({
              champ: 'quantite',
              produitId: ligne.produitId,
              produit: produit.nom,
              avant,
              apres: quantite,
            });
          }

          if (existante) {
            await existante.update({ quantite, prixUnitaire, sousTotal }, { transaction });
          } else {
            await CommandeItem.create(
              { commandeId: id, produitId: ligne.produitId, quantite, prixUnitaire, sousTotal },
              { transaction }
            );
          }
        }

        const nouveauMontant = Number(
          (montantArticles + Number(commande.fraisLivraison || 0)).toFixed(2)
        );
        if (nouveauMontant !== Number(commande.montantTotal)) {
          changements.push({
            champ: 'montantTotal',
            avant: Number(commande.montantTotal),
            apres: nouveauMontant,
          });
        }
        commande.montantTotal = nouveauMontant;
      }

      if (note !== undefined && note !== commande.note) {
        changements.push({ champ: 'note', avant: commande.note, apres: note });
        commande.note = note;
      }
      if (
        dateLivraisonSouhaitee !== undefined &&
        String(dateLivraisonSouhaitee) !== String(commande.dateLivraisonSouhaitee)
      ) {
        changements.push({
          champ: 'dateLivraisonSouhaitee',
          avant: commande.dateLivraisonSouhaitee,
          apres: dateLivraisonSouhaitee,
        });
        commande.dateLivraisonSouhaitee = dateLivraisonSouhaitee;
      }

      if (!changements.length) {
        await transaction.rollback();
        return { success: false, status: 400, message: 'Aucun changement à appliquer' };
      }

      let responsable = vendeurResponsableId || null;
      if (responsabilite === RESPONSABILITE.VENDEUR && !responsable) {
        const premier = await Produit.scope('administration').findByPk(
          commande.items[0]?.produitId,
          { attributes: ['vendeurId'], transaction }
        );
        responsable = premier?.vendeurId || null;
      }

      await commande.update(
        {
          montantTotal: commande.montantTotal,
          note: commande.note,
          dateLivraisonSouhaitee: commande.dateLivraisonSouhaitee,
          modifieeAt: new Date(),
          modifieePar: adminId || null,
          vendeurResponsableId: responsable || commande.vendeurResponsableId,
          // JSONB : on réassigne le tableau entier, Sequelize ne détecte pas
          // une mutation en place sur un champ JSON.
          historiqueModifications: [
            ...(commande.historiqueModifications || []),
            {
              date: new Date().toISOString(),
              parQui: ORIGINE_ACTION.ADMIN,
              adminId: adminId || null,
              motif: motif.trim(),
              responsabilite: responsabilite || null,
              changements,
            },
          ],
        },
        { transaction }
      );

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    // Même règle que l'annulation : on signale le changement, pas sa cause.
    await GestionCommandeService._notifierClient(commande, {
      titre: 'Commande modifiée',
      message: `Votre commande ${commande.reference} a été modifiée. Son nouveau détail est disponible dans l'application.`,
      type: 'commande_modifiee',
      statutEmail: commande.statut,
    });

    const rechargee = await GestionCommandeService.getCommandeById(id);
    return {
      success: true,
      message: 'Commande modifiée',
      changements,
      commande: rechargee.commande,
    };
  }

  /**
   * Produits d'une commande déclarés en rupture de stock par l'administration,
   * en général après le refus d'un vendeur.
   *
   * C'est ici, et pas au refus du vendeur, que le client est prévenu :
   * notification (push + application), email, et motif visible sur sa page
   * commande. Les lignes restent affichées « en rupture », ne sont plus
   * facturées, et le stock du produit passe à 0.
   */
  static async marquerRupture(id, { produitIds = [], motif, adminId } = {}) {
    const raison = String(motif || '').trim();
    if (!raison) {
      return { success: false, status: 400, message: 'Le motif est obligatoire' };
    }

    const commande = await Commande.scope('administration').findByPk(id, {
      include: [
        {
          model: CommandeItem,
          as: 'items',
          include: [{ model: Produit, as: 'produit', attributes: ['id', 'nom'] }],
        },
        { model: User, as: 'user', attributes: ['id', 'email'] },
      ],
    });
    if (!commande) return { success: false, status: 404, message: 'Commande introuvable' };

    if (
      [STATUT_COMMANDE.LIVREE, STATUT_COMMANDE.ANNULEE, STATUT_COMMANDE.REJETEE].includes(
        commande.statut
      )
    ) {
      return {
        success: false,
        status: 400,
        message: 'Une commande livrée, annulée ou rejetée ne peut plus être modifiée',
      };
    }

    const lignes = commande.items.filter((i) => produitIds.includes(i.produitId));
    if (lignes.length !== new Set(produitIds).size) {
      return { success: false, status: 400, message: 'Produit absent de cette commande' };
    }
    const nouvelles = lignes.filter((l) => !l.enRupture);
    if (!nouvelles.length) {
      return { success: false, status: 400, message: 'Ces produits sont déjà en rupture' };
    }

    const maintenant = new Date();
    const transaction = await sequelize.transaction();
    try {
      for (const ligne of nouvelles) {
        await ligne.update(
          { enRupture: true, motifRupture: raison, ruptureLe: maintenant },
          { transaction }
        );
        // Rupture de stock : le produit n'est plus commandable.
        await Produit.update({ stock: 0 }, { where: { id: ligne.produitId }, transaction });
      }

      // Le client ne paie que ce qui sera livré. Plus rien à livrer : plus de
      // frais de livraison non plus.
      const restantes = commande.items.filter((i) => !i.enRupture);
      const articles = restantes.reduce((somme, i) => somme + Number(i.sousTotal || 0), 0);
      const nouveauMontant = restantes.length
        ? Number((articles + Number(commande.fraisLivraison || 0)).toFixed(2))
        : 0;

      await commande.update(
        {
          montantTotal: nouveauMontant,
          modifieeAt: maintenant,
          modifieePar: adminId || null,
          historiqueModifications: [
            ...(commande.historiqueModifications || []),
            {
              date: maintenant.toISOString(),
              parQui: ORIGINE_ACTION.ADMIN,
              adminId: adminId || null,
              motif: raison,
              changements: [
                ...nouvelles.map((l) => ({
                  champ: 'rupture',
                  produitId: l.produitId,
                  produit: l.produit?.nom,
                  avant: l.quantite,
                  apres: 0,
                })),
                {
                  champ: 'montantTotal',
                  avant: Number(commande.montantTotal),
                  apres: nouveauMontant,
                },
              ],
            },
          ],
        },
        { transaction }
      );
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    // Client prévenu : notification (push + application) et email, avec le motif.
    const noms = nouvelles.map((l) => l.produit?.nom || 'Produit');
    const toutEnRupture = commande.items.every((i) => i.enRupture);
    await NotificationService.emettre({
      userId: commande.userId,
      titre: noms.length > 1 ? 'Produits en rupture de stock' : 'Produit en rupture de stock',
      message: `${noms.join(', ')} : en rupture de stock dans votre commande ${commande.reference}. Motif : ${raison}`,
      type: 'commande_rupture',
      donnees: { commandeId: commande.id, reference: commande.reference },
    });
    if (commande.user?.email) {
      try {
        await sendRuptureStock(commande.user.email, commande, { produits: noms, motif: raison });
      } catch (err) {
        logger.error('[Commande] Email de rupture non envoyé', {
          commandeId: commande.id,
          error: err.message,
        });
      }
    }

    const rechargee = await GestionCommandeService.getCommandeById(id);
    return {
      success: true,
      message: toutEnRupture
        ? 'Client prévenu. Plus aucun produit à livrer : pensez à annuler la commande.'
        : 'Client prévenu de la rupture de stock',
      toutEnRupture,
      commande: rechargee.commande,
    };
  }

  /**
   * Notifie le client d'un changement sur sa commande : notification in-app
   * et email. « Au mieux » : la commande est déjà enregistrée, un service de
   * notification indisponible ne doit pas faire échouer l'opération.
   */
  static async _notifierClient(commande, { titre, message, type, statutEmail }) {
    if (!commande.userId) return;

    await NotificationService.emettre({
      userId: commande.userId,
      titre,
      message,
      type,
      donnees: { commandeId: commande.id, reference: commande.reference },
    });

    if (commande.user?.email) {
      try {
        await sendCommandeStatut(commande.user.email, commande, statutEmail);
      } catch (err) {
        logger.error('[Commande] Email de changement non envoyé', {
          commandeId: commande.id,
          error: err.message,
        });
      }
    }
  }

  /**
   * Fiabilité des vendeurs : part de leurs commandes qui a mal tourné *de leur
   * fait*. Seules les annulations et les retours marqués « responsabilité
   * vendeur » comptent — un client qui change d'avis n'entache personne.
   *
   * Le score part de 100 et retire le taux d'incidents ; il n'a de sens qu'à
   * partir de quelques commandes, d'où `commandesTotal` renvoyé à côté pour
   * que l'interface puisse relativiser un 0 % sur une seule vente.
   */
  static async getFiabiliteVendeurs({ limit = 50 } = {}) {
    const rows = await sequelize.query(
      `
      WITH ventes AS (
        SELECT p."vendeurId", COUNT(DISTINCT c.id) AS commandes
        FROM commandes c
        JOIN commande_items ci ON ci."commandeId" = c.id
        JOIN produits p ON p.id = ci."produitId"
        WHERE p."vendeurId" IS NOT NULL
        GROUP BY p."vendeurId"
      ),
      annulations AS (
        SELECT "vendeurResponsableId" AS "vendeurId", COUNT(*) AS annulations
        FROM commandes
        WHERE "responsabiliteAnnulation" = :vendeur
          AND "vendeurResponsableId" IS NOT NULL
        GROUP BY 1
      ),
      retours AS (
        SELECT "vendeurResponsableId" AS "vendeurId", COUNT(*) AS retours
        FROM retours
        WHERE responsabilite = :vendeur
          AND statut <> :refuse
          AND "vendeurResponsableId" IS NOT NULL
        GROUP BY 1
      )
      SELECT
        u.id,
        u.nom,
        u.prenom,
        u.email,
        pv."nomBoutique",
        COALESCE(v.commandes, 0)   AS "commandesTotal",
        COALESCE(a.annulations, 0) AS "annulationsImputables",
        COALESCE(r.retours, 0)     AS "retoursImputables"
      FROM users u
      LEFT JOIN profils_vendeurs pv ON pv."userId" = u.id
      LEFT JOIN ventes v      ON v."vendeurId" = u.id
      LEFT JOIN annulations a ON a."vendeurId" = u.id
      LEFT JOIN retours r     ON r."vendeurId" = u.id
      WHERE u.role = :roleVendeur
      -- Postgres refuse un alias de sortie à l'intérieur d'une expression
      -- ORDER BY : les termes sont répétés tels quels.
      ORDER BY (COALESCE(a.annulations, 0) + COALESCE(r.retours, 0)) DESC, u.nom ASC
      LIMIT :limit
      `,
      {
        replacements: {
          vendeur: RESPONSABILITE.VENDEUR,
          refuse: STATUT_RETOUR.REFUSE,
          roleVendeur: ROLES.VENDEUR,
          limit: Number(limit) || 50,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    return {
      success: true,
      vendeurs: rows.map((r) => {
        const commandesTotal = Number(r.commandesTotal);
        const incidents = Number(r.annulationsImputables) + Number(r.retoursImputables);
        const tauxIncident = commandesTotal
          ? Number(((incidents / commandesTotal) * 100).toFixed(1))
          : 0;

        return {
          id: r.id,
          nom: r.nom,
          prenom: r.prenom,
          email: r.email,
          nomBoutique: r.nomBoutique,
          commandesTotal,
          annulationsImputables: Number(r.annulationsImputables),
          retoursImputables: Number(r.retoursImputables),
          incidents,
          tauxIncident,
          scoreFiabilite: Number(Math.max(0, 100 - tauxIncident).toFixed(1)),
        };
      }),
    };
  }

  static async getCommandesParClient(userId) {
    const commandes = await Commande.scope('administration').findAll({
      where: { userId },
      include: [{ model: CommandeItem, as: 'items', include: [{ model: Produit, as: 'produit' }] }],
      order: [['createdAt', 'DESC']],
    });

    return { success: true, commandes };
  }
  static async getKpiCommandes() {
    const [total, enAttente, validees, annulees, rejetees, livrees, ca] = await Promise.all([
      Commande.count(),
      Commande.count({ where: { statut: 'en_attente' } }),
      Commande.count({ where: { statut: 'validee' } }),
      Commande.count({ where: { statut: 'annulee' } }),
      Commande.count({ where: { statut: STATUT_COMMANDE.REJETEE } }),
      Commande.count({ where: { statut: 'livree' } }),
      Commande.sum('montantTotal', { where: { statut: 'livree' } }),
    ]);
    return {
      success: true,
      kpi: { total, enAttente, validees, annulees, rejetees, livrees, chiffreAffaires: ca || 0 },
    };
  }

  static async exportCommandes({ statut, userId, reference } = {}) {
    const where = {};
    if (statut) where.statut = statut;
    if (userId) where.userId = userId;
    if (reference) where.reference = reference;

    const commandes = await Commande.scope('administration').findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['nom', 'prenom', 'email'] },
        { model: CommandeItem, as: 'items' },
      ],
      order: [['createdAt', 'DESC']],
    });

    const rows = commandes.map((c) => ({
      reference: c.reference,
      date: c.createdAt.toISOString().slice(0, 10),
      client: c.user ? `${c.user.prenom} ${c.user.nom}` : '',
      email: c.user ? c.user.email : '',
      statut: c.statut,
      nbArticles: c.items.reduce((sum, i) => sum + i.quantite, 0),
      montantTotal: c.montantTotal,
      fraisLivraison: c.fraisLivraison,
    }));

    const csv = toCsv(rows, [
      { key: 'reference', label: 'Référence' },
      { key: 'date', label: 'Date' },
      { key: 'client', label: 'Client' },
      { key: 'email', label: 'Email' },
      { key: 'statut', label: 'Statut' },
      { key: 'nbArticles', label: 'Nb articles' },
      { key: 'montantTotal', label: 'Montant total' },
      { key: 'fraisLivraison', label: 'Frais livraison' },
    ]);

    return { success: true, csv };
  }
}

module.exports = GestionCommandeService;
