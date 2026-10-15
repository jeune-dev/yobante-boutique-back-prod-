const { Op } = require('sequelize');
const {
  Commande,
  CommandeItem,
  Produit,
  User,
  Adresse,
  AcceptationCommande,
  sequelize,
} = require('../../models');
const paginate = require('../../utils/paginate');
const { round2 } = require('../../utils/money');
const { STATUT_COMMANDE, ROLES } = require('../../constants');
const { statutPublic, statutsReels } = require('../../utils/statutCommande');
const NotificationService = require('../notification');
const { sendMail } = require('../../utils/mailer');
const logger = require('../../config/logger');
const refusVendeurTemplate = require('../../templates/mail/refusVendeur.template');

const lienCommandeAdmin = (id) =>
  `${String(process.env.ADMIN_URL || 'https://admin.yobante-boutique.com').replace(/\/+$/, '')}/boutique/commandes/${id}`;

// Un vendeur décide tant que la commande n'est pas engagée en logistique :
// au-delà, les articles sont déjà préparés ou partis.
const STATUTS_DECIDABLES = [
  STATUT_COMMANDE.EN_ATTENTE,
  STATUT_COMMANDE.EN_MODIFICATION,
  STATUT_COMMANDE.VALIDEE,
];

// Une commande annulée ne compte ni dans le chiffre d'affaires ni dans les ventes.
const STATUTS_VENDUS = Object.values(STATUT_COMMANDE).filter((s) => s !== STATUT_COMMANDE.ANNULEE);

/**
 * Vue vendeur des commandes.
 *
 * Une commande peut mélanger les produits de plusieurs vendeurs : on ne renvoie
 * donc jamais la commande brute, mais uniquement les lignes appartenant au
 * vendeur courant, plus un `montantVendeur` recalculé sur ces seules lignes.
 * `montantTotal` de la commande n'est volontairement pas exposé : il inclut les
 * produits des autres vendeurs.
 */
class VendeurCommandeService {
  /** Ids des commandes contenant au moins un produit du vendeur. */
  static async #commandeIdsDuVendeur(vendeurId) {
    const lignes = await CommandeItem.findAll({
      attributes: [
        [sequelize.fn('DISTINCT', sequelize.col('CommandeItem.commandeId')), 'commandeId'],
      ],
      include: [
        {
          model: Produit,
          as: 'produit',
          attributes: [],
          where: { vendeurId },
          required: true,
        },
      ],
      raw: true,
    });
    return lignes.map((l) => l.commandeId);
  }

  static async getMesCommandes(vendeurId, { page, limit, statut } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);

    const commandeIds = await this.#commandeIdsDuVendeur(vendeurId);
    if (!commandeIds.length) {
      return {
        success: true,
        commandes: [],
        pagination: { total: 0, totalPages: 0, page: p, limit: l },
      };
    }

    const where = { id: { [Op.in]: commandeIds } };
    // « en attente » couvre aussi les commandes en modification (interne).
    if (statut) where.statut = { [Op.in]: statutsReels(statutPublic(statut)) };

    // Pagination en deux temps : on sélectionne d'abord les ids de la page, puis
    // on charge les lignes sans `limit`. Combiner `limit` et un include hasMany
    // filtré pousse Sequelize à générer une sous-requête dans laquelle le `where`
    // sur `produit` ne peut plus référencer la table jointe.
    const [count, pageIds] = await Promise.all([
      Commande.count({ where }),
      Commande.scope('administration').findAll({
        where,
        attributes: ['id'],
        order: [['createdAt', 'DESC']],
        limit: l,
        offset,
        raw: true,
      }),
    ]);

    const rows = pageIds.length
      ? await Commande.scope('administration').findAll({
          where: { id: { [Op.in]: pageIds.map((c) => c.id) } },
          include: [
            { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'telephone'] },
            { model: Adresse, as: 'adresse', attributes: ['id', 'ville', 'rue'] },
            {
              model: CommandeItem,
              as: 'items',
              required: true,
              include: [
                {
                  model: Produit,
                  as: 'produit',
                  attributes: ['id', 'nom', 'slug', 'images', 'vendeurId'],
                  where: { vendeurId },
                  required: true,
                },
              ],
            },
          ],
          order: [['createdAt', 'DESC']],
        })
      : [];

    // Décision du vendeur sur chaque commande de la page : la liste doit
    // montrer ce qui reste à confirmer, sans ouvrir chaque commande.
    const decisions = rows.length
      ? await AcceptationCommande.findAll({
          where: { vendeurId, commandeId: { [Op.in]: rows.map((c) => c.id) } },
          attributes: ['commandeId', 'statut', 'motifRefus', 'decideLe'],
          raw: true,
        })
      : [];
    const decisionPar = new Map(decisions.map((d) => [d.commandeId, d]));

    const commandes = rows.map((c) => {
      const json = c.toJSON();
      const montantVendeur = round2(json.items.reduce((sum, i) => sum + Number(i.sousTotal), 0));
      delete json.montantTotal;
      const decision = decisionPar.get(json.id);
      return {
        ...json,
        statut: statutPublic(json.statut),
        montantVendeur,
        acceptation: decision
          ? {
              statut: decision.statut,
              motifRefus: decision.motifRefus,
              decideLe: decision.decideLe,
            }
          : null,
        decisionPossible: !decision && STATUTS_DECIDABLES.includes(json.statut),
      };
    });

    return {
      success: true,
      commandes,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async getCommandeById(vendeurId, id) {
    // findAll plutôt que findOne : ce dernier ajoute un `limit: 1` implicite qui
    // déclencherait la même sous-requête incompatible que dans getMesCommandes.
    const [commande] = await Commande.scope('administration').findAll({
      where: { id },
      include: [
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'telephone', 'email'] },
        { model: Adresse, as: 'adresse' },
        {
          model: CommandeItem,
          as: 'items',
          required: true,
          include: [
            {
              model: Produit,
              as: 'produit',
              attributes: ['id', 'nom', 'slug', 'images', 'vendeurId'],
              where: { vendeurId },
              required: true,
            },
          ],
        },
      ],
    });

    // `required: true` sur les includes : une commande sans ligne du vendeur
    // ressort introuvable, ce qui est exactement le comportement voulu.
    if (!commande) return { success: false, message: 'Commande introuvable' };

    const json = commande.toJSON();
    const montantVendeur = round2(json.items.reduce((sum, i) => sum + Number(i.sousTotal), 0));
    delete json.montantTotal;

    // Sa propre décision, et s'il peut encore en prendre une : sans cela le
    // vendeur ne saurait pas s'il a déjà répondu ni pourquoi le bouton a
    // disparu.
    const decision = await AcceptationCommande.findOne({
      where: { commandeId: id, vendeurId },
      attributes: ['statut', 'motifRefus', 'decideLe'],
    });

    return {
      success: true,
      commande: {
        ...json,
        statut: statutPublic(json.statut),
        montantVendeur,
        acceptation: decision ? decision.toJSON() : null,
        decisionPossible: !decision && STATUTS_DECIDABLES.includes(json.statut),
      },
    };
  }

  /**
   * Décision du vendeur sur une commande : il l'accepte ou la refuse.
   *
   * Une commande pouvant mêler plusieurs vendeurs, la décision ne porte que
   * sur les lignes de celui qui décide — elle ne change donc pas le statut de
   * la commande, qui reste piloté par l'administration.
   *
   * La décision est définitive : la revenir dessus fausserait le taux
   * d'acceptation, qui n'aurait plus de sens comme indicateur de fiabilité.
   */
  static async decider(vendeurId, commandeId, { statut, motif } = {}) {
    if (!['acceptee', 'refusee'].includes(statut)) {
      return { success: false, status: 400, message: 'Décision inconnue' };
    }
    // Un refus sans motif ne permet ni d'informer l'administration ni d'en
    // tirer un suivi : on l'exige.
    if (statut === 'refusee' && !motif?.trim()) {
      return { success: false, status: 400, message: 'Le motif du refus est obligatoire' };
    }

    // Réutilise la portée du vendeur : une commande sans ligne à lui ressort
    // introuvable, ce qui empêche de décider pour autrui.
    const vue = await VendeurCommandeService.getCommandeById(vendeurId, commandeId);
    if (!vue.success) return { success: false, status: 404, message: 'Commande introuvable' };

    if (!STATUTS_DECIDABLES.includes(vue.commande.statut)) {
      return {
        success: false,
        status: 400,
        message: `Une commande « ${vue.commande.statut} » ne peut plus être acceptée ni refusée`,
      };
    }

    const existante = await AcceptationCommande.findOne({ where: { commandeId, vendeurId } });
    if (existante) {
      return {
        success: false,
        status: 409,
        message: `Vous avez déjà ${existante.statut === 'acceptee' ? 'accepté' : 'refusé'} cette commande`,
      };
    }

    const decision = await AcceptationCommande.create({
      commandeId,
      vendeurId,
      statut,
      motifRefus: statut === 'refusee' ? motif.trim() : null,
      decideLe: new Date(),
    });

    // L'administration doit voir passer un refus sans attendre de consulter
    // un tableau : c'est elle qui devra réattribuer ou annuler.
    if (statut === 'refusee') {
      await VendeurCommandeService.#alerterAdministrateurs(vendeurId, vue.commande, motif.trim());
    }

    return {
      success: true,
      message: statut === 'acceptee' ? 'Commande acceptée' : 'Commande refusée',
      decision,
    };
  }

  /**
   * Produits indisponibles chez un vendeur : l'administration est prévenue
   * par une notification enregistrée ET par email — le dashboard n'affiche
   * pas de cloche, l'email est donc l'alerte qui la touche réellement.
   * « Au mieux » : un échec d'envoi n'annule pas la décision du vendeur.
   */
  static async #alerterAdministrateurs(vendeurId, commande, motif) {
    try {
      const [admins, vendeur] = await Promise.all([
        User.findAll({
          where: { role: ROLES.ADMIN, isActive: true },
          attributes: ['id', 'email'],
          raw: true,
        }),
        User.findByPk(vendeurId, {
          attributes: ['nom', 'prenom', 'telephone'],
          include: [{ association: 'profilVendeur', attributes: ['nomBoutique'] }],
        }),
      ]);
      const nomVendeur = [vendeur?.prenom, vendeur?.nom].filter(Boolean).join(' ') || 'Un vendeur';
      const boutique = vendeur?.profilVendeur?.nomBoutique || null;
      const produits = (commande.items || []).map(
        (i) => `${i.quantite} × ${i.produit?.nom ?? 'Produit'}`
      );

      await NotificationService.emettre({
        userIds: admins.map((a) => a.id),
        titre: 'Produit indisponible chez un vendeur',
        message: `Commande ${commande.reference} — ${boutique || nomVendeur} : ${motif}`,
        type: 'commande_refusee_vendeur',
        donnees: { commandeId: commande.id, vendeurId },
      });

      const html = refusVendeurTemplate({
        reference: commande.reference,
        vendeur: nomVendeur,
        boutique,
        telephone: vendeur?.telephone,
        produits,
        motif,
        lien: lienCommandeAdmin(commande.id),
      });
      await Promise.all(
        admins
          .filter((a) => a.email)
          .map((a) =>
            sendMail({
              to: a.email,
              subject: `Produit indisponible — commande ${commande.reference}`,
              html,
            })
          )
      );
    } catch (err) {
      logger.error('Alerte de refus vendeur non envoyée', { error: err.message, vendeurId });
    }
  }

  /**
   * Taux d'acceptation d'un vendeur.
   *
   * Dénominateur : les commandes qui lui ont été soumises, c'est-à-dire
   * celles contenant au moins un de ses produits. Les commandes encore sans
   * décision comptent dans le total mais ni en accepté ni en refusé — sinon
   * un vendeur qui ne répond jamais afficherait 100 % d'acceptation.
   */
  static async getTauxAcceptation(vendeurId) {
    const [soumises, decisions] = await Promise.all([
      VendeurCommandeService.#commandeIdsDuVendeur(vendeurId),
      AcceptationCommande.findAll({
        where: { vendeurId },
        attributes: ['statut', [sequelize.fn('COUNT', sequelize.col('id')), 'nb']],
        group: ['statut'],
        raw: true,
      }),
    ]);

    const total = soumises.length;
    const parStatut = Object.fromEntries(decisions.map((d) => [d.statut, Number(d.nb)]));
    const acceptees = parStatut.acceptee || 0;
    const refusees = parStatut.refusee || 0;

    return {
      success: true,
      acceptation: {
        soumises: total,
        acceptees,
        refusees,
        enAttente: Math.max(0, total - acceptees - refusees),
        tauxAcceptation: total ? Number(((acceptees / total) * 100).toFixed(1)) : 0,
        tauxRefus: total ? Number(((refusees / total) * 100).toFixed(1)) : 0,
      },
    };
  }

  /**
   * Agrégats de ventes du vendeur : CA, volumes, top produits et série
   * journalière pour le graphique de l'accueil mobile.
   */
  static async getVentes(vendeurId, { jours = 30 } = {}) {
    const depuis = new Date();
    depuis.setDate(depuis.getDate() - Number(jours));

    const lignesVendeur = {
      model: Produit,
      as: 'produit',
      attributes: [],
      where: { vendeurId },
      required: true,
    };
    const commandeVendue = {
      model: Commande,
      as: 'commande',
      attributes: [],
      where: { statut: { [Op.in]: STATUTS_VENDUS } },
      required: true,
    };

    const [totaux, totauxPeriode, topProduits, parJour] = await Promise.all([
      // Cumul depuis toujours
      CommandeItem.findOne({
        attributes: [
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('sousTotal')), 0), 'ca'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('quantite')), 0), 'unites'],
          [
            sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('commande.id'))),
            'commandes',
          ],
        ],
        include: [lignesVendeur, commandeVendue],
        raw: true,
      }),
      // Même chose restreint à la période demandée
      CommandeItem.findOne({
        attributes: [
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('sousTotal')), 0), 'ca'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('quantite')), 0), 'unites'],
          [
            sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('commande.id'))),
            'commandes',
          ],
        ],
        include: [
          lignesVendeur,
          {
            ...commandeVendue,
            where: {
              statut: { [Op.in]: STATUTS_VENDUS },
              createdAt: { [Op.gte]: depuis },
            },
          },
        ],
        raw: true,
      }),
      CommandeItem.findAll({
        attributes: [
          'produitId',
          [sequelize.col('produit.nom'), 'nom'],
          [sequelize.fn('SUM', sequelize.col('quantite')), 'unites'],
          [sequelize.fn('SUM', sequelize.col('sousTotal')), 'ca'],
        ],
        include: [{ ...lignesVendeur, attributes: [] }, commandeVendue],
        group: ['CommandeItem.produitId', 'produit.id', 'produit.nom'],
        order: [[sequelize.literal('unites'), 'DESC']],
        limit: 5,
        raw: true,
      }),
      CommandeItem.findAll({
        attributes: [
          [sequelize.fn('DATE', sequelize.col('commande.createdAt')), 'jour'],
          [sequelize.fn('SUM', sequelize.col('sousTotal')), 'ca'],
          [sequelize.fn('SUM', sequelize.col('quantite')), 'unites'],
        ],
        include: [
          lignesVendeur,
          {
            ...commandeVendue,
            where: {
              statut: { [Op.in]: STATUTS_VENDUS },
              createdAt: { [Op.gte]: depuis },
            },
          },
        ],
        group: [sequelize.fn('DATE', sequelize.col('commande.createdAt'))],
        order: [[sequelize.fn('DATE', sequelize.col('commande.createdAt')), 'ASC']],
        raw: true,
      }),
    ]);

    const enAttente = await Commande.count({
      where: {
        statut: {
          [Op.in]: [
            STATUT_COMMANDE.EN_ATTENTE,
            STATUT_COMMANDE.EN_MODIFICATION,
            STATUT_COMMANDE.VALIDEE,
          ],
        },
        id: { [Op.in]: await this.#commandeIdsDuVendeur(vendeurId) },
      },
    });

    return {
      success: true,
      ventes: {
        chiffreAffaires: round2(totaux.ca),
        unitesVendues: Number(totaux.unites),
        nombreCommandes: Number(totaux.commandes),
        periode: {
          jours: Number(jours),
          chiffreAffaires: round2(totauxPeriode.ca),
          unitesVendues: Number(totauxPeriode.unites),
          nombreCommandes: Number(totauxPeriode.commandes),
        },
        commandesATraiter: enAttente,
        topProduits: topProduits.map((t) => ({
          produitId: t.produitId,
          nom: t.nom,
          unites: Number(t.unites),
          chiffreAffaires: round2(t.ca),
        })),
        parJour: parJour.map((j) => ({
          jour: j.jour,
          chiffreAffaires: round2(j.ca),
          unites: Number(j.unites),
        })),
      },
    };
  }
}

module.exports = VendeurCommandeService;
