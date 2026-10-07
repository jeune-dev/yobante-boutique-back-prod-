const { Op, fn, col, literal } = require('sequelize');
const {
  User,
  Produit,
  Commande,
  CommandeItem,
  ProfilVendeur,
  Categorie,
  Rayon,
  sequelize,
} = require('../../models');
const { ROLES, NIVEAU_STOCK, SEUILS_STOCK, STATUT_COMMANDE } = require('../../constants');

// Statuts d'une commande encore à livrer : elle est engagée mais pas arrivée.
const STATUTS_A_LIVRER = [
  STATUT_COMMANDE.VALIDEE,
  STATUT_COMMANDE.EN_PREPARATION,
  STATUT_COMMANDE.EXPEDIEE,
];

/**
 * Résout une période en bornes de dates.
 *
 * `jour` / `semaine` / `mois` / `annee` couvrent les filtres du dashboard ;
 * `personnalise` accepte deux dates explicites. `tout` ne borne rien, ce qui
 * donne les totaux historiques (comportement d'avant le filtre).
 */
function resoudrePeriode({ periode = 'mois', debut, fin } = {}) {
  if (periode === 'tout') return { debut: null, fin: null, periode };

  if (periode === 'personnalise') {
    const d = debut ? new Date(debut) : null;
    const f = fin ? new Date(fin) : null;
    // Borne de fin inclusive : l'utilisateur qui saisit le 31/03 attend que
    // les commandes du 31/03 à 18 h soient comptées.
    if (f) f.setHours(23, 59, 59, 999);
    return { debut: d, fin: f, periode };
  }

  const maintenant = new Date();
  const d = new Date(maintenant);
  if (periode === 'jour') d.setHours(0, 0, 0, 0);
  else if (periode === 'semaine') d.setDate(maintenant.getDate() - 7);
  else if (periode === 'annee') d.setFullYear(maintenant.getFullYear(), 0, 1);
  else d.setFullYear(maintenant.getFullYear(), maintenant.getMonth(), 1);
  if (periode !== 'jour') d.setHours(0, 0, 0, 0);

  return { debut: d, fin: maintenant, periode };
}

/** Clause `where` sur createdAt, vide si la période n'est pas bornée. */
function clauseDate(debut, fin, colonne = 'createdAt') {
  if (!debut && !fin) return {};
  const contrainte = {};
  if (debut) contrainte[Op.gte] = debut;
  if (fin) contrainte[Op.lte] = fin;
  return { [colonne]: contrainte };
}

class DashboardService {
  static async getStatsGlobales() {
    const [
      totalClients,
      totalVendeurs,
      totalCategories,
      totalProduits,
      totalCommandes,
      chiffreAffaires,
    ] = await Promise.all([
      User.count({ where: { role: ROLES.CLIENT } }),
      User.count({ where: { role: ROLES.VENDEUR } }),
      Rayon.count({ where: { isActive: true } }),
      Produit.count({ where: { isActive: true } }),
      Commande.count(),
      Commande.sum('montantTotal', { where: { statut: 'livree' } }),
    ]);

    return {
      success: true,
      totalClients,
      totalVendeurs,
      totalCategories,
      totalProduits,
      totalCommandes,
      chiffreAffaires: chiffreAffaires || 0,
    };
  }

  static async getCommandesParStatut() {
    const rows = await Commande.scope('administration').findAll({
      attributes: ['statut', [fn('COUNT', col('id')), 'count']],
      group: ['statut'],
      raw: true,
    });

    return {
      success: true,
      stats: rows.map((r) => ({ statut: r.statut, count: Number(r.count) })),
    };
  }

  static async getRevenusParMois(annee = new Date().getFullYear()) {
    const rows = await Commande.scope('administration').findAll({
      attributes: [
        [fn('EXTRACT', literal('MONTH FROM "createdAt"')), 'mois'],
        [fn('SUM', col('montantTotal')), 'revenus'],
      ],
      where: {
        statut: 'livree',
        createdAt: {
          [Op.gte]: new Date(`${annee}-01-01`),
          [Op.lt]: new Date(`${Number(annee) + 1}-01-01`),
        },
      },
      group: [literal('1')],
      raw: true,
    });

    const parMois = Array.from({ length: 12 }, (_, i) => ({ mois: i + 1, revenus: 0 }));
    rows.forEach((r) => {
      parMois[Number(r.mois) - 1].revenus = Number(r.revenus) || 0;
    });

    return { success: true, revenus: parMois };
  }

  /** Fix N+1 : JOIN direct CommandeItem → Produit dans une seule requête */
  static async getProduitsPlusVendus(limit = 10) {
    const rows = await CommandeItem.findAll({
      attributes: [
        'produitId',
        [fn('SUM', col('quantite')), 'totalVendu'],
        [col('produit.nom'), 'nomProduit'],
        [col('produit.slug'), 'slugProduit'],
        [col('produit.prix'), 'prixProduit'],
        [col('produit.images'), 'imagesProduit'],
      ],
      include: [
        {
          model: require('../../models').Produit,
          as: 'produit',
          attributes: [],
          required: true,
        },
      ],
      group: ['CommandeItem.produitId', 'produit.id'],
      order: [[literal('"totalVendu"'), 'DESC']],
      limit: parseInt(limit, 10),
      raw: true,
    });

    return {
      success: true,
      produits: rows.map((r) => ({
        produitId: r.produitId,
        nom: r.nomProduit,
        slug: r.slugProduit,
        prix: r.prixProduit,
        images: r.imagesProduit,
        totalVendu: Number(r.totalVendu),
      })),
    };
  }

  static async getClientsActifs(limit = 10) {
    const rows = await Commande.scope('administration').findAll({
      attributes: [
        'userId',
        [fn('COUNT', col('Commande.id')), 'nbCommandes'],
        [col('user.nom'), 'nom'],
        [col('user.prenom'), 'prenom'],
        [col('user.email'), 'email'],
      ],
      include: [
        {
          model: User,
          as: 'user',
          attributes: [],
          required: true,
        },
      ],
      group: ['Commande.userId', 'user.id'],
      order: [[literal('"nbCommandes"'), 'DESC']],
      limit: parseInt(limit, 10),
      raw: true,
    });

    return {
      success: true,
      clients: rows.map((r) => ({
        userId: r.userId,
        nom: r.nom,
        prenom: r.prenom,
        email: r.email,
        nbCommandes: Number(r.nbCommandes),
      })),
    };
  }

  static async getCommandesRecentes(limit = 10) {
    const commandes = await Commande.scope('administration').findAll({
      include: [
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email'] },
        { model: CommandeItem, as: 'items' },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
    });

    return { success: true, commandes };
  }

  static async getStockAlertes(seuil = 5) {
    const produits = await Produit.findAll({
      where: { stock: { [Op.lte]: seuil }, isActive: true },
      attributes: ['id', 'nom', 'slug', 'stock', 'stockAlloue', 'reference'],
      order: [['stock', 'ASC']],
    });

    return { success: true, produits };
  }

  /**
   * KPI stocks : une seule requête SQL avec COUNTs conditionnels.
   *
   * Quatre paliers (vert / orange / rouge / noir) au lieu de trois. Les seuils
   * viennent de SEUILS_STOCK pour rester alignés sur `niveauDeStock`, qui
   * colore la liste des produits.
   */
  static async getKpiStocks() {
    const [kpiRow, produitsRupture] = await Promise.all([
      sequelize.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE "isActive" = true)                                        AS "totalProduits",
          COUNT(*) FILTER (WHERE "isActive" = true AND stock <= 0)                         AS "enRupture",
          COUNT(*) FILTER (WHERE "isActive" = true AND stock > 0 AND stock <= :imminente)  AS "ruptureImminente",
          COUNT(*) FILTER (WHERE "isActive" = true AND stock > :imminente AND stock <= :faible) AS "stockFaible",
          COUNT(*) FILTER (WHERE "isActive" = true AND stock > :faible)                    AS "stockOk"
        FROM produits
      `,
        {
          replacements: {
            imminente: SEUILS_STOCK.RUPTURE_IMMINENTE,
            faible: SEUILS_STOCK.FAIBLE,
          },
          type: sequelize.QueryTypes.SELECT,
        }
      ),
      Produit.findAll({
        where: { stock: 0, isActive: true },
        attributes: ['id', 'nom', 'slug', 'stock', 'stockAlloue', 'reference'],
        order: [['updatedAt', 'DESC']],
        limit: 20,
      }),
    ]);

    const kpi = kpiRow[0];
    const total = Number(kpi.totalProduits);

    const produitsEnAttente = await Produit.count({
      where: { statutValidation: 'en_attente', isActive: true },
    });

    return {
      success: true,
      kpi: {
        totalProduits: total,
        produitsActifs: total,
        produitsEnRupture: Number(kpi.enRupture),
        produitsEnAttente,
        // Les quatre paliers d'alerte, du plus grave au plus sain.
        [NIVEAU_STOCK.RUPTURE]: Number(kpi.enRupture),
        [NIVEAU_STOCK.RUPTURE_IMMINENTE]: Number(kpi.ruptureImminente),
        [NIVEAU_STOCK.FAIBLE]: Number(kpi.stockFaible),
        [NIVEAU_STOCK.NORMAL]: Number(kpi.stockOk),
        // Conservées : le dashboard existant lit encore ces deux clés.
        stockFaible: Number(kpi.stockFaible),
        stockOk: Number(kpi.stockOk),
        seuils: SEUILS_STOCK,
        tauxRupture: total ? ((Number(kpi.enRupture) / total) * 100).toFixed(1) : 0,
      },
      produitsRupture,
    };
  }

  /**
   * KPI de ventes sur une période — alimente les tuiles du tableau de bord.
   *
   * Deux compteurs sont volontairement distincts :
   *  - `nombreCommandes` : nombre de commandes passées ;
   *  - `nombreVentes`    : nombre d'articles vendus (somme des quantités).
   *    Une commande de trois articles compte pour une commande et trois ventes.
   *
   * `tauxConversion` mesure, parmi les clients inscrits sur la période, la
   * part qui a passé au moins une commande. La base ne contient aucun suivi de
   * visites : un taux visiteurs → commandes est impossible à calculer ici.
   */
  static async getKpiVentes(filtres = {}) {
    const { debut, fin, periode } = resoudrePeriode(filtres);
    const surLaPeriode = clauseDate(debut, fin);

    const [
      nombreCommandes,
      commandesLivrees,
      commandesALivrer,
      commandesAnnulees,
      clientsInscrits,
      clientsConvertis,
      ventes,
    ] = await Promise.all([
      Commande.count({ where: { ...surLaPeriode } }),
      Commande.count({ where: { statut: STATUT_COMMANDE.LIVREE, ...surLaPeriode } }),
      Commande.count({ where: { statut: { [Op.in]: STATUTS_A_LIVRER }, ...surLaPeriode } }),
      Commande.count({ where: { statut: STATUT_COMMANDE.ANNULEE, ...surLaPeriode } }),
      User.count({ where: { role: ROLES.CLIENT, ...surLaPeriode } }),
      User.count({
        where: { role: ROLES.CLIENT, ...surLaPeriode },
        include: [{ model: Commande, as: 'commandes', attributes: [], required: true }],
        distinct: true,
      }),
      // Une seule requête pour les quantités et le chiffre d'affaires : le
      // JOIN évite de charger toutes les lignes de commande en mémoire.
      sequelize.query(
        `
        SELECT
          COALESCE(SUM(ci.quantite), 0)     AS "articlesVendus",
          COALESCE(SUM(ci."sousTotal"), 0)  AS "chiffreAffaires"
        FROM commande_items ci
        JOIN commandes c ON c.id = ci."commandeId"
        WHERE c.statut = :livree
          AND (CAST(:debut AS timestamptz) IS NULL OR c."createdAt" >= CAST(:debut AS timestamptz))
          AND (CAST(:fin   AS timestamptz) IS NULL OR c."createdAt" <= CAST(:fin   AS timestamptz))
        `,
        {
          replacements: {
            livree: STATUT_COMMANDE.LIVREE,
            debut: debut ? debut.toISOString() : null,
            fin: fin ? fin.toISOString() : null,
          },
          type: sequelize.QueryTypes.SELECT,
        }
      ),
    ]);

    const chiffreAffaires = Number(ventes[0].chiffreAffaires) || 0;
    const nombreVentes = Number(ventes[0].articlesVendus) || 0;

    return {
      success: true,
      periode: {
        type: periode,
        debut: debut ? debut.toISOString() : null,
        fin: fin ? fin.toISOString() : null,
      },
      kpi: {
        nombreVentes,
        nombreCommandes,
        chiffreAffaires,
        // Rapporté aux commandes livrées, seules à avoir produit du revenu :
        // diviser par toutes les commandes écraserait le panier avec les
        // commandes en attente ou annulées.
        panierMoyen: commandesLivrees ? Number((chiffreAffaires / commandesLivrees).toFixed(2)) : 0,
        basePanierMoyen: 'commandes livrées',
        clientsInscrits,
        clientsConvertis,
        tauxConversion: clientsInscrits
          ? Number(((clientsConvertis / clientsInscrits) * 100).toFixed(1))
          : 0,
        formuleTauxConversion: 'clients ayant commandé / clients inscrits sur la période',
        commandesLivrees,
        commandesALivrer,
        commandesAnnulees,
      },
    };
  }

  /**
   * Nombre de clients inscrits par pas de temps, pour la courbe du dashboard.
   * `pas` vaut 'jour' ou 'mois' ; `date_trunc` garantit des intervalles pleins.
   */
  static async getInscriptionsParPeriode({ pas = 'mois', debut, fin } = {}) {
    const unite = pas === 'jour' ? 'day' : 'month';
    const bornes = resoudrePeriode({
      periode: debut || fin ? 'personnalise' : 'annee',
      debut,
      fin,
    });

    const rows = await sequelize.query(
      `
      SELECT
        date_trunc(:unite, "createdAt") AS intervalle,
        COUNT(*)                        AS inscrits
      FROM users
      WHERE role = :role
        AND (CAST(:debut AS timestamptz) IS NULL OR "createdAt" >= CAST(:debut AS timestamptz))
        AND (CAST(:fin   AS timestamptz) IS NULL OR "createdAt" <= CAST(:fin   AS timestamptz))
      GROUP BY 1
      ORDER BY 1
      `,
      {
        replacements: {
          unite,
          role: ROLES.CLIENT,
          debut: bornes.debut ? bornes.debut.toISOString() : null,
          fin: bornes.fin ? bornes.fin.toISOString() : null,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    return {
      success: true,
      pas,
      inscriptions: rows.map((r) => ({
        intervalle: r.intervalle,
        inscrits: Number(r.inscrits),
      })),
    };
  }

  static async getStatsVendeurs() {
    const [totalVendeurs, vendeursActifs, enAttenteValidation, produitsSoumis] = await Promise.all([
      User.count({ where: { role: ROLES.VENDEUR } }),
      User.count({ where: { role: ROLES.VENDEUR, isActive: true } }),
      ProfilVendeur.count({ where: { isValidatedStep2: false } }),
      Produit.count({ where: { statutValidation: 'en_attente' } }),
    ]);

    return {
      success: true,
      stats: { totalVendeurs, vendeursActifs, enAttenteValidation, produitsSoumis },
    };
  }

  /**
   * Agrégat unique du tableau de bord. `filtres` ne s'applique qu'aux KPI de
   * ventes : les totaux globaux, les stocks et les listes restent à l'instant
   * présent, qui est ce qu'on attend d'un tableau de bord.
   */
  static async getKpiComplet(filtres = {}) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      stats,
      commandesParStatut,
      revenusParMois,
      produitsPlusVendus,
      clientsActifs,
      commandesRecentes,
      kpiStocks,
      statsVendeurs,
      caJour,
      caSemaine,
      caMois,
      commandesEnAttente,
      promotionsActives,
      kpiVentes,
    ] = await Promise.all([
      DashboardService.getStatsGlobales(),
      DashboardService.getCommandesParStatut(),
      DashboardService.getRevenusParMois(),
      DashboardService.getProduitsPlusVendus(10),
      DashboardService.getClientsActifs(5),
      DashboardService.getCommandesRecentes(10),
      DashboardService.getKpiStocks(),
      DashboardService.getStatsVendeurs(),
      Commande.sum('montantTotal', {
        where: { statut: 'livree', createdAt: { [Op.gte]: startOfDay } },
      }),
      Commande.sum('montantTotal', {
        where: { statut: 'livree', createdAt: { [Op.gte]: startOfWeek } },
      }),
      Commande.sum('montantTotal', {
        where: { statut: 'livree', createdAt: { [Op.gte]: startOfMonth } },
      }),
      Commande.count({ where: { statut: 'en_attente' } }),
      require('../../models').Promotion.count({ where: { isActive: true } }),
      DashboardService.getKpiVentes(filtres),
    ]);

    return {
      success: true,
      kpi: {
        ...stats,
        caJour: caJour || 0,
        caSemaine: caSemaine || 0,
        caMois: caMois || 0,
        commandesEnAttente,
        promotionsActives,
        ...kpiVentes.kpi,
      },
      periode: kpiVentes.periode,
      commandesParStatut: commandesParStatut.stats,
      revenusParMois: revenusParMois.revenus,
      produitsPlusVendus: produitsPlusVendus.produits,
      clientsActifs: clientsActifs.clients,
      commandesRecentes: commandesRecentes.commandes,
      kpiStocks: kpiStocks.kpi,
      produitsRupture: kpiStocks.produitsRupture,
      statsVendeurs: statsVendeurs.stats,
    };
  }
}

module.exports = DashboardService;
