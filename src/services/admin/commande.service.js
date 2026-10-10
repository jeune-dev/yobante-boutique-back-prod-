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
const { sendCommandeStatut } = require('../../utils/mailer');
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
const PRODUIT_LISTE = ['id', 'nom', 'prix', 'reference'];

const TRANSITIONS = {
  validee: 'en_attente',
  en_preparation: 'validee',
  expediee: 'en_preparation',
  livree: 'expediee',
};

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

    // Nombre de vendeurs ayant déclaré leurs produits indisponibles : la
    // liste le signale sans ouvrir chaque commande.
    const refus = rows.length
      ? await AcceptationCommande.findAll({
          where: { statut: 'refusee', commandeId: { [Op.in]: rows.map((c) => c.id) } },
          attributes: ['commandeId', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
          group: ['commandeId'],
          raw: true,
        })
      : [];
    const refusPar = new Map(refus.map((r) => [r.commandeId, Number(r.total) || 0]));

    return {
      success: true,
      commandes: rows.map((c) => ({ ...c.toJSON(), refusVendeurs: refusPar.get(c.id) ?? 0 })),
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
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
    for (const l of lignes) {
      const vendeurId = l.produit?.vendeurId;
      if (!vendeurId) continue;
      if (!produitsPar.has(vendeurId)) produitsPar.set(vendeurId, []);
      produitsPar.get(vendeurId).push(`${l.quantite} × ${l.produit.nom}`);
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

  static async _transition(id, statutAttendu, nouveauStatut, extra = {}) {
    const commande = await Commande.scope('administration').findByPk(id, {
      include: [{ model: User, as: 'user' }],
    });
    if (!commande) {
      return { success: false, message: 'Commande introuvable' };
    }

    if (statutAttendu && commande.statut !== statutAttendu) {
      return {
        success: false,
        message: `La commande doit être en statut "${statutAttendu}" pour cette action`,
      };
    }

    await commande.update({ statut: nouveauStatut, ...extra });

    if (commande.user) {
      await sendCommandeStatut(commande.user.email, commande, nouveauStatut);
    }

    return { success: true, message: 'Commande mise à jour avec succès', commande };
  }

  static validerCommande(id, noteAdmin) {
    return GestionCommandeService._transition(
      id,
      'en_attente',
      'validee',
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

    const user = await User.findByPk(result.commande.userId, { attributes: ['email'] });
    if (user) await sendCommandeStatut(user.email, result.commande, STATUT_COMMANDE.REJETEE);

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
