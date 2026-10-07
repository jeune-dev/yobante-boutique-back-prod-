const { sequelize } = require('../../models');
const {
  STATUT_COMMANDE,
  STATUT_RETOUR,
  STATUT_REVERSEMENT,
  ROLES,
  SEUILS_STOCK,
} = require('../../constants');

/**
 * Indicateurs analytiques du tableau de bord.
 *
 * Tout est en SQL agrégé plutôt qu'en chargement d'objets : ces écrans
 * balaient l'historique complet des commandes, et passer par Sequelize
 * reviendrait à monter des dizaines de milliers de lignes en mémoire pour
 * n'en garder qu'une somme.
 *
 * Conventions partagées par toutes les méthodes :
 *  - une **vente** est une commande `livree` ; une commande annulée ou en
 *    attente n'a encore produit aucun revenu ;
 *  - **marketplace** désigne un produit rattaché à un vendeur
 *    (`produits.vendeurId` non nul), **propre** un produit sans vendeur ;
 *  - les bornes de période sont inclusives et acceptent `null` des deux
 *    côtés, ce qui donne les totaux historiques.
 */

/** Bornes SQL réutilisées partout, en paramètres nommés. */
const BORNES = `
  AND (CAST(:debut AS timestamptz) IS NULL OR c."createdAt" >= CAST(:debut AS timestamptz))
  AND (CAST(:fin   AS timestamptz) IS NULL OR c."createdAt" <= CAST(:fin   AS timestamptz))
`;

function normaliserBornes({ debut, fin } = {}) {
  return {
    debut: debut ? new Date(debut).toISOString() : null,
    // Fin inclusive : saisir le 31/03 doit compter les commandes du 31/03 au soir.
    fin: fin ? new Date(new Date(fin).setHours(23, 59, 59, 999)).toISOString() : null,
  };
}

const nombre = (v) => Number(v) || 0;
const pourcent = (part, total) => (total ? Number(((part / total) * 100).toFixed(1)) : 0);

class AnalytiqueService {
  /**
   * Les indicateurs de tête de l'écran d'accueil.
   *
   * Un seul aller-retour par famille d'indicateurs, exécutés en parallèle :
   * l'écran en affiche une dizaine, les enchaîner tripleraient son temps
   * d'affichage.
   */
  static async getKpiAccueil(filtres = {}) {
    const b = normaliserBornes(filtres);
    const repl = { ...b, livree: STATUT_COMMANDE.LIVREE };

    const [ventes, commandes, clients, stock, livraison] = await Promise.all([
      // CA, marge et volumes : une jointure unique sur les lignes livrées.
      sequelize.query(
        `
        SELECT
          COALESCE(SUM(ci."sousTotal"), 0)                      AS "chiffreAffaires",
          COALESCE(SUM(ci.quantite), 0)                         AS "articlesVendus",
          COALESCE(SUM(ci.quantite * p."prixAchat"), 0)         AS "coutAchat",
          COALESCE(SUM(ci."sousTotal") FILTER (WHERE p."vendeurId" IS NOT NULL), 0) AS "caMarketplace",
          COALESCE(SUM(ci."sousTotal") FILTER (WHERE p."vendeurId" IS NULL), 0)     AS "caPropre",
          -- Lignes sans prix d'achat : la marge globale est alors partielle,
          -- et l'interface doit pouvoir le dire plutôt que d'afficher un
          -- chiffre faussement exact.
          COUNT(*) FILTER (WHERE p."prixAchat" IS NULL)         AS "lignesSansPrixAchat",
          COUNT(*)                                              AS "lignesTotal"
        FROM commande_items ci
        JOIN commandes c ON c.id = ci."commandeId"
        JOIN produits  p ON p.id = ci."produitId"
        WHERE c.statut = :livree ${BORNES}
        `,
        { replacements: repl, type: sequelize.QueryTypes.SELECT }
      ),
      sequelize.query(
        `
        SELECT
          COUNT(*)                                        AS "total",
          COUNT(*) FILTER (WHERE statut = :livree)        AS "livrees",
          COALESCE(SUM("fraisLivraison") FILTER (WHERE statut = :livree), 0) AS "fraisEncaisses"
        FROM commandes c
        WHERE TRUE ${BORNES}
        `,
        { replacements: repl, type: sequelize.QueryTypes.SELECT }
      ),
      sequelize.query(
        `
        SELECT COUNT(DISTINCT c."userId") AS "clientsActifs"
        FROM commandes c
        WHERE TRUE ${BORNES}
        `,
        { replacements: repl, type: sequelize.QueryTypes.SELECT }
      ),
      // Stocks : état à l'instant présent, une période n'a pas de sens ici.
      sequelize.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE "isActive")                                AS "produitsActifs",
          COUNT(*) FILTER (WHERE "isActive" AND stock <= 0)                 AS "enRupture",
          COUNT(*) FILTER (WHERE "isActive" AND stock > 0 AND stock <= :faible) AS "enAlerte",
          COALESCE(SUM(stock * "prixAchat") FILTER (WHERE "isActive"), 0)   AS "valeurStock"
        FROM produits
        `,
        { replacements: { faible: SEUILS_STOCK.FAIBLE }, type: sequelize.QueryTypes.SELECT }
      ),
      // Logistique : également à l'instant T, indépendamment de la période.
      sequelize.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE statut IN ('validee', 'en_preparation', 'expediee')) AS "aLivrer",
          COUNT(*) FILTER (WHERE statut = 'en_preparation')                           AS "enPreparation",
          COUNT(*) FILTER (
            WHERE statut IN ('validee', 'en_preparation', 'expediee')
              AND "dateLivraisonSouhaitee" IS NOT NULL
              AND "dateLivraisonSouhaitee" < CURRENT_DATE
          )                                                                            AS "enRetard"
        FROM commandes
        `,
        { type: sequelize.QueryTypes.SELECT }
      ),
    ]);

    const v = ventes[0];
    const ca = nombre(v.chiffreAffaires);
    const coutAchat = nombre(v.coutAchat);
    const margeBrute = Number((ca - coutAchat).toFixed(2));
    const nbCommandes = nombre(commandes[0].total);
    const produitsActifs = nombre(stock[0].produitsActifs);

    return {
      success: true,
      periode: b,
      kpi: {
        chiffreAffaires: ca,
        caMarketplace: nombre(v.caMarketplace),
        caPropre: nombre(v.caPropre),
        partMarketplace: pourcent(nombre(v.caMarketplace), ca),
        nombreCommandes: nbCommandes,
        commandesLivrees: nombre(commandes[0].livrees),
        // Formule demandée : CA ÷ nombre de commandes, toutes commandes
        // confondues. Le CA ne provient que des commandes livrées, le panier
        // est donc minoré par les commandes annulées ou encore en cours —
        // d'où `panierMoyenLivrees`, qui rapporte le CA aux seules ventes
        // effectives.
        panierMoyen: nbCommandes ? Number((ca / nbCommandes).toFixed(2)) : 0,
        panierMoyenLivrees: nombre(commandes[0].livrees)
          ? Number((ca / nombre(commandes[0].livrees)).toFixed(2))
          : 0,
        articlesVendus: nombre(v.articlesVendus),
        margeBrute,
        tauxMarge: pourcent(margeBrute, ca),
        // Honnêteté du chiffre : sans prix d'achat sur certaines lignes, la
        // marge est sous-évaluée et l'écran doit le signaler.
        margeComplete: nombre(v.lignesSansPrixAchat) === 0,
        lignesSansPrixAchat: nombre(v.lignesSansPrixAchat),
        lignesTotal: nombre(v.lignesTotal),
        clientsActifs: nombre(clients[0].clientsActifs),
        fraisLivraisonEncaisses: nombre(commandes[0].fraisEncaisses),
        produitsActifs,
        produitsEnAlerte: nombre(stock[0].enAlerte),
        produitsEnRupture: nombre(stock[0].enRupture),
        tauxRupture: pourcent(nombre(stock[0].enRupture), produitsActifs),
        valeurStockAchat: nombre(stock[0].valeurStock),
        commandesALivrer: nombre(livraison[0].aLivrer),
        commandesEnPreparation: nombre(livraison[0].enPreparation),
        commandesEnRetard: nombre(livraison[0].enRetard),
      },
    };
  }

  /**
   * Page « À surveiller » : ce qui exige une décision, pas un tableau de
   * chiffres.
   *
   * Chaque alerte porte une gravité, un décompte et les premières lignes
   * concernées — l'écran doit permettre d'agir sans ouvrir cinq autres pages
   * pour savoir de quoi il retourne.
   *
   * `seuilAnnulation` est exprimé en pourcentage (5 = 5 %).
   */
  static async getAlertes({ seuilAnnulation = 5, limiteExemples = 10 } = {}) {
    const limite = Math.min(Number(limiteExemples) || 10, 50);

    const [stocks, vendeurs, retards, reclamations, paiements] = await Promise.all([
      AnalytiqueService.getIndicateursStock({}),
      AnalytiqueService.getTableauVendeurs({}),
      sequelize.query(
        `
        SELECT c.id, c.reference, c."dateLivraisonSouhaitee", c.statut, c."montantTotal",
               u.nom, u.prenom,
               CURRENT_DATE - c."dateLivraisonSouhaitee" AS "joursRetard"
        FROM commandes c
        LEFT JOIN users u ON u.id = c."userId"
        WHERE c.statut IN ('validee', 'en_preparation', 'expediee')
          AND c."dateLivraisonSouhaitee" IS NOT NULL
          AND c."dateLivraisonSouhaitee" < CURRENT_DATE
        ORDER BY c."dateLivraisonSouhaitee" ASC
        LIMIT :limite
        `,
        { replacements: { limite }, type: sequelize.QueryTypes.SELECT }
      ),
      // Réclamations : signalements encore ouverts, groupés par cible. Deux
      // signalements ou plus sur la même cible sortent du bruit de fond.
      sequelize.query(
        `
        SELECT "cibleId", type, COUNT(*) AS nb
        FROM signalements
        WHERE statut <> 'traite'
        GROUP BY "cibleId", type
        HAVING COUNT(*) > 1
        ORDER BY 3 DESC
        LIMIT :limite
        `,
        { replacements: { limite }, type: sequelize.QueryTypes.SELECT }
      ),
      // Reversements enregistrés mais pas encore payés. `COUNT(*) OVER ()`
      // donne le total avant LIMIT : l'alerte annonce le bon nombre tout en
      // ne transportant que les premières lignes comme exemples.
      sequelize.query(
        `
        SELECT
          r.id, r.reference, r.montant, r."createdAt",
          u.nom, u.prenom, pv."nomBoutique",
          COUNT(*) OVER ()                 AS "total",
          SUM(r.montant) OVER ()           AS "montantTotal"
        FROM reversements r
        JOIN users u ON u.id = r."vendeurId"
        LEFT JOIN profils_vendeurs pv ON pv."userId" = u.id
        WHERE r.statut = :enAttente
        ORDER BY r."createdAt" ASC
        LIMIT :limite
        `,
        {
          replacements: { enAttente: STATUT_REVERSEMENT.EN_ATTENTE, limite },
          type: sequelize.QueryTypes.SELECT,
        }
      ),
    ]);

    const enRupture = stocks.produits.filter((p) => p.enRupture);
    const sousSeuil = stocks.produits.filter((p) => p.sousSeuilVentes);
    const surstock = stocks.produits.filter((p) => p.rotationFaible);
    // Un vendeur sans commande n'a pas de taux : 0/0 n'est pas « 0 % », c'est
    // une absence de mesure, et il n'a rien à faire dans une alerte.
    const vendeursRisque = vendeurs.vendeurs.filter(
      (v) => v.commandes > 0 && v.tauxAnnulation > Number(seuilAnnulation)
    );

    const dateFr = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

    const alertes = [
      {
        cle: 'produits_rupture',
        gravite: 'critique',
        libelle: 'produit(s) en rupture de stock',
        nombre: enRupture.length,
        lien: '/boutique/stock?vue=rupture',
        exemples: enRupture.slice(0, limite).map((p) => ({
          id: p.id,
          libelle: p.nom,
          detail: `${p.rayon} · dernier mouvement le ${dateFr(p.derniereMaj)}`,
        })),
      },
      {
        cle: 'vendeurs_annulation',
        gravite: 'critique',
        libelle: `vendeur(s) au-dessus de ${seuilAnnulation} % d'annulation`,
        nombre: vendeursRisque.length,
        lien: '/boutique/analytics/vendeurs',
        exemples: vendeursRisque.slice(0, limite).map((v) => ({
          id: v.id,
          libelle: v.nomBoutique || `${v.prenom} ${v.nom}`,
          detail: `${v.tauxAnnulation} % d'annulation sur ${v.commandes} commande(s)`,
        })),
      },
      {
        cle: 'commandes_retard',
        gravite: 'attention',
        libelle: 'commande(s) en retard de livraison',
        nombre: retards.length,
        lien: '/boutique/commandes',
        exemples: retards.map((c) => ({
          id: c.id,
          libelle: c.reference,
          detail: `${c.joursRetard} jour(s) de retard · ${[c.prenom, c.nom].filter(Boolean).join(' ') || 'client inconnu'}`,
        })),
      },
      {
        cle: 'stock_sous_seuil',
        gravite: 'attention',
        libelle: 'produit(s) sous deux semaines de ventes',
        nombre: sousSeuil.length,
        lien: '/boutique/stock?vue=alerte',
        exemples: sousSeuil.slice(0, limite).map((p) => ({
          id: p.id,
          libelle: p.nom,
          detail: `${p.stock} en stock pour ${p.ventesMoyennes14j}/jour observés`,
        })),
      },
      {
        cle: 'reclamations',
        gravite: 'critique',
        libelle: 'cible(s) avec plusieurs réclamations ouvertes',
        nombre: reclamations.length,
        lien: '/boutique/reclamations',
        exemples: reclamations.map((r) => ({
          id: r.cibleId,
          libelle: `${r.type} signalé ${r.nb} fois`,
          detail: 'signalements non traités',
        })),
      },
      {
        cle: 'surstock',
        gravite: 'attention',
        libelle: 'produit(s) avec plus de deux mois de stock',
        nombre: surstock.length,
        lien: '/boutique/stock?vue=surstock',
        exemples: surstock.slice(0, limite).map((p) => ({
          id: p.id,
          libelle: p.nom,
          detail: `${p.joursCouverture} jours de couverture · ${p.valeurStock ?? '—'} immobilisés`,
        })),
      },
      {
        cle: 'paiements_vendeurs',
        gravite: 'attention',
        libelle: 'paiement(s) vendeur en attente',
        nombre: paiements.length ? Number(paiements[0].total) : 0,
        // Le montant total gelé : dix versements de 500 F et dix de 500 000 F
        // ne demandent pas la même réaction.
        montant: paiements.length ? Number(paiements[0].montantTotal) : 0,
        lien: '/boutique/finance/reversements',
        exemples: paiements.map((p) => ({
          id: p.id,
          libelle: p.nomBoutique || `${p.prenom} ${p.nom}`,
          detail: `${p.reference} · ${Number(p.montant).toLocaleString('fr-FR')} FCFA · enregistré le ${dateFr(p.createdAt)}`,
        })),
      },
    ];

    return {
      success: true,
      // Les rubriques vides restent dans la réponse : une liste dont les
      // entrées changent à chaque chargement est illisible, et « 0 produit en
      // rupture » est une information en soi.
      alertes,
      synthese: {
        critiques: alertes.filter((a) => a.gravite === 'critique' && a.nombre > 0).length,
        attentions: alertes.filter((a) => a.gravite === 'attention' && a.nombre > 0).length,
        total: alertes.reduce((s, a) => s + a.nombre, 0),
      },
      // Ce que la base ne permet pas encore de surveiller, pour que l'écran le
      // dise au lieu de laisser croire à une absence d'alerte. Vide depuis que
      // les reversements existent en base : les paiements vendeurs en attente
      // sont une alerte à part entière, plus une mesure impossible.
      indisponibles: [],
    };
  }

  /** Chiffre d'affaires et marge par rayon, sur la période. */
  static async getCaParRayon(filtres = {}) {
    const b = normaliserBornes(filtres);
    const lignes = await sequelize.query(
      `
      SELECT
        r.id,
        COALESCE(r.nom, 'Sans rayon')                 AS "rayon",
        COALESCE(SUM(ci."sousTotal"), 0)              AS "chiffreAffaires",
        COALESCE(SUM(ci.quantite), 0)                 AS "articlesVendus",
        COALESCE(SUM(ci.quantite * p."prixAchat"), 0) AS "coutAchat",
        COUNT(DISTINCT c.id)                          AS "commandes"
      FROM commande_items ci
      JOIN commandes c ON c.id = ci."commandeId"
      JOIN produits  p ON p.id = ci."produitId"
      LEFT JOIN rayons r ON r.id = p."rayonId"
      WHERE c.statut = :livree ${BORNES}
      GROUP BY r.id, r.nom
      ORDER BY 3 DESC
      `,
      {
        replacements: { ...b, livree: STATUT_COMMANDE.LIVREE },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const total = lignes.reduce((s, l) => s + nombre(l.chiffreAffaires), 0);
    return {
      success: true,
      total,
      rayons: lignes.map((l) => {
        const ca = nombre(l.chiffreAffaires);
        const marge = Number((ca - nombre(l.coutAchat)).toFixed(2));
        return {
          id: l.id,
          rayon: l.rayon,
          chiffreAffaires: ca,
          articlesVendus: nombre(l.articlesVendus),
          commandes: nombre(l.commandes),
          margeBrute: marge,
          tauxMarge: pourcent(marge, ca),
          part: pourcent(ca, total),
        };
      }),
    };
  }

  /**
   * Meilleures ventes, éventuellement restreintes à un rayon ou à l'offre
   * marketplace. `origine` vaut 'marketplace', 'propre' ou rien.
   */
  static async getTopProduits({ limit = 20, rayonId, origine, ...filtres } = {}) {
    const b = normaliserBornes(filtres);
    const lignes = await sequelize.query(
      `
      SELECT
        p.id, p.nom, p.slug, p.images, p.stock,
        COALESCE(r.nom, 'Sans rayon')                 AS "rayon",
        u.id                                          AS "vendeurId",
        COALESCE(u.prenom || ' ' || u.nom, 'Yobante') AS "vendeur",
        COALESCE(SUM(ci.quantite), 0)                 AS "quantiteVendue",
        COALESCE(SUM(ci."sousTotal"), 0)              AS "chiffreAffaires",
        COALESCE(SUM(ci.quantite * p."prixAchat"), 0) AS "coutAchat"
      FROM commande_items ci
      JOIN commandes c ON c.id = ci."commandeId"
      JOIN produits  p ON p.id = ci."produitId"
      LEFT JOIN rayons r ON r.id = p."rayonId"
      LEFT JOIN users  u ON u.id = p."vendeurId"
      WHERE c.statut = :livree ${BORNES}
        AND (CAST(:rayonId AS uuid) IS NULL OR p."rayonId" = CAST(:rayonId AS uuid))
        AND (:origine = 'tout'
             OR (:origine = 'marketplace' AND p."vendeurId" IS NOT NULL)
             OR (:origine = 'propre'      AND p."vendeurId" IS NULL))
      GROUP BY p.id, p.nom, p.slug, p.images, p.stock, r.nom, u.id, u.prenom, u.nom
      ORDER BY 9 DESC
      LIMIT :limit
      `,
      {
        replacements: {
          ...b,
          livree: STATUT_COMMANDE.LIVREE,
          rayonId: rayonId || null,
          origine: origine || 'tout',
          limit: Math.min(Number(limit) || 20, 100),
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    return {
      success: true,
      produits: lignes.map((l) => {
        const ca = nombre(l.chiffreAffaires);
        const marge = Number((ca - nombre(l.coutAchat)).toFixed(2));
        return {
          id: l.id,
          nom: l.nom,
          slug: l.slug,
          images: l.images,
          rayon: l.rayon,
          stock: nombre(l.stock),
          vendeurId: l.vendeurId,
          vendeur: l.vendeur,
          marketplace: Boolean(l.vendeurId),
          quantiteVendue: nombre(l.quantiteVendue),
          chiffreAffaires: ca,
          margeBrute: marge,
          tauxMarge: pourcent(marge, ca),
        };
      }),
    };
  }

  /**
   * Indicateurs clients : acquisition, activité, fidélité.
   *
   * `tauxConversion` rapporte les clients ayant commandé aux clients
   * inscrits sur la période. La base ne contient aucun suivi de visites : un
   * taux visiteurs → commandes est impossible à calculer ici.
   */
  static async getIndicateursClients(filtres = {}) {
    const b = normaliserBornes(filtres);

    const [acquisition, fidelite] = await Promise.all([
      sequelize.query(
        `
        SELECT
          COUNT(*)                                       AS "inscrits",
          COUNT(*) FILTER (WHERE cmd.nb > 0)             AS "convertis",
          -- Délai entre l'inscription et la première commande, en jours.
          AVG(EXTRACT(EPOCH FROM (cmd.premiere - u."createdAt")) / 86400)
            FILTER (WHERE cmd.premiere IS NOT NULL)      AS "joursAvantAchat"
        FROM users u
        LEFT JOIN (
          SELECT "userId", COUNT(*) AS nb, MIN("createdAt") AS premiere
          FROM commandes GROUP BY "userId"
        ) cmd ON cmd."userId" = u.id
        WHERE u.role = :role
          AND (CAST(:debut AS timestamptz) IS NULL OR u."createdAt" >= CAST(:debut AS timestamptz))
          AND (CAST(:fin   AS timestamptz) IS NULL OR u."createdAt" <= CAST(:fin   AS timestamptz))
        `,
        { replacements: { ...b, role: ROLES.CLIENT }, type: sequelize.QueryTypes.SELECT }
      ),
      // Fidélité : calculée sur l'ensemble des clients, pas seulement ceux
      // inscrits sur la période — le réachat d'un client de l'an dernier
      // compte autant.
      sequelize.query(
        `
        WITH activite AS (
          SELECT
            u.id,
            COUNT(c.id)                                   AS commandes,
            COALESCE(SUM(c."montantTotal") FILTER (WHERE c.statut = :livree), 0) AS depense,
            MAX(c."createdAt")                            AS derniere
          FROM users u
          LEFT JOIN commandes c ON c."userId" = u.id
          WHERE u.role = :role
          GROUP BY u.id
        )
        SELECT
          COUNT(*)                                        AS "clientsTotal",
          COUNT(*) FILTER (WHERE commandes > 0)           AS "acheteurs",
          COUNT(*) FILTER (WHERE commandes > 1)           AS "reacheteurs",
          -- Inactif : aucune commande depuis 90 jours, parmi ceux qui ont
          -- déjà acheté. Un client qui n'a jamais commandé n'est pas « perdu ».
          COUNT(*) FILTER (
            WHERE commandes > 0 AND derniere < NOW() - INTERVAL '90 days'
          )                                               AS "inactifs",
          COALESCE(AVG(depense) FILTER (WHERE commandes > 0), 0) AS "depenseMoyenne",
          COALESCE(AVG(commandes) FILTER (WHERE commandes > 0), 0) AS "commandesMoyennes"
        FROM activite
        `,
        {
          replacements: { role: ROLES.CLIENT, livree: STATUT_COMMANDE.LIVREE },
          type: sequelize.QueryTypes.SELECT,
        }
      ),
    ]);

    const a = acquisition[0];
    const f = fidelite[0];
    const acheteurs = nombre(f.acheteurs);

    return {
      success: true,
      periode: b,
      clients: {
        inscrits: nombre(a.inscrits),
        convertis: nombre(a.convertis),
        tauxConversion: pourcent(nombre(a.convertis), nombre(a.inscrits)),
        formuleTauxConversion: 'clients ayant commandé / clients inscrits sur la période',
        joursAvantPremierAchat:
          a.joursAvantAchat === null ? null : Number(Number(a.joursAvantAchat).toFixed(1)),
        clientsTotal: nombre(f.clientsTotal),
        acheteurs,
        tauxReachat: pourcent(nombre(f.reacheteurs), acheteurs),
        inactifs: nombre(f.inactifs),
        tauxChurn: pourcent(nombre(f.inactifs), acheteurs),
        fenetreChurnJours: 90,
        // CLV approchée : dépense moyenne déjà réalisée par acheteur. Sans
        // durée de vie observable, toute projection serait une invention.
        valeurVieClient: Number(nombre(f.depenseMoyenne).toFixed(2)),
        commandesParAcheteur: Number(nombre(f.commandesMoyennes).toFixed(2)),
      },
    };
  }

  /**
   * Stocks : couverture, rotation et valeur.
   *
   * `ventesMoyennesJour` est mesurée sur 21 jours : trois semaines lissent
   * les à-coups hebdomadaires sans diluer une tendance récente.
   */
  static async getIndicateursStock({ fenetreJours = 21 } = {}) {
    const lignes = await sequelize.query(
      `
      WITH ventes AS (
        SELECT
          ci."produitId",
          SUM(ci.quantite)                                                  AS "quantiteFenetre",
          SUM(ci.quantite) FILTER (WHERE c."createdAt" >= NOW() - INTERVAL '14 days') AS "quantite14j"
        FROM commande_items ci
        JOIN commandes c ON c.id = ci."commandeId"
        WHERE c.statut = :livree
          AND c."createdAt" >= NOW() - (:fenetre || ' days')::interval
        GROUP BY ci."produitId"
      )
      SELECT
        p.id, p.nom, p.slug, p.stock, p."stockAlloue", p."prixAchat", p.prix,
        COALESCE(r.nom, 'Sans rayon')        AS "rayon",
        COALESCE(v."quantiteFenetre", 0)     AS "quantiteFenetre",
        COALESCE(v."quantite14j", 0)         AS "quantite14j",
        p."updatedAt"                        AS "derniereMaj"
      FROM produits p
      LEFT JOIN rayons r ON r.id = p."rayonId"
      LEFT JOIN ventes v ON v."produitId" = p.id
      WHERE p."isActive" = true
      `,
      {
        replacements: { livree: STATUT_COMMANDE.LIVREE, fenetre: Number(fenetreJours) || 21 },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const produits = lignes.map((l) => {
      const stock = nombre(l.stock);
      const fenetre = Number(fenetreJours) || 21;
      const parJour = nombre(l.quantiteFenetre) / fenetre;
      // Moyenne sur 14 jours : seuil d'alerte demandé par la boutique.
      const moyenne14j = nombre(l.quantite14j) / 14;

      return {
        id: l.id,
        nom: l.nom,
        slug: l.slug,
        rayon: l.rayon,
        stock,
        stockDisponible: stock - nombre(l.stockAlloue),
        prixAchat: l.prixAchat === null ? null : Number(l.prixAchat),
        valeurStock: l.prixAchat === null ? null : Number((stock * Number(l.prixAchat)).toFixed(2)),
        ventesMoyennesJour: Number(parJour.toFixed(2)),
        ventesMoyennes14j: Number(moyenne14j.toFixed(2)),
        quantiteFenetre: nombre(l.quantiteFenetre),
        // `null` plutôt que l'infini quand rien ne se vend : le stock ne
        // s'épuise pas, ce qui n'est pas la même information que « 0 jour ».
        joursCouverture: parJour > 0 ? Math.round(stock / parJour) : null,
        enRupture: stock <= 0,
        // Alerte : le stock ne couvre plus deux semaines de ventes observées.
        sousSeuilVentes: stock > 0 && moyenne14j > 0 && stock < moyenne14j * 14,
        // Surstock : plus de deux mois d'écoulement immobilisés.
        rotationFaible: parJour > 0 && stock / parJour > 60,
        derniereMaj: l.derniereMaj,
      };
    });

    const actifs = produits.length;
    const enRupture = produits.filter((p) => p.enRupture).length;

    return {
      success: true,
      fenetreJours: Number(fenetreJours) || 21,
      synthese: {
        produitsActifs: actifs,
        enRupture,
        tauxRupture: pourcent(enRupture, actifs),
        sousSeuilVentes: produits.filter((p) => p.sousSeuilVentes).length,
        rotationFaible: produits.filter((p) => p.rotationFaible).length,
        valeurStockAchat: Number(produits.reduce((s, p) => s + (p.valeurStock ?? 0), 0).toFixed(2)),
        produitsSansPrixAchat: produits.filter((p) => p.prixAchat === null).length,
      },
      produits,
    };
  }

  /** Livraison : charge à l'instant T et performance sur la période. */
  static async getIndicateursLivraison(filtres = {}) {
    const b = normaliserBornes(filtres);

    const [instant, periode] = await Promise.all([
      sequelize.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE statut IN ('validee', 'en_preparation', 'expediee')) AS "aLivrer",
          COUNT(*) FILTER (WHERE statut = 'en_preparation')                           AS "enPreparation",
          COUNT(*) FILTER (WHERE statut = 'expediee')                                 AS "expediees",
          COUNT(*) FILTER (
            WHERE statut IN ('validee', 'en_preparation', 'expediee')
              AND "dateLivraisonSouhaitee" IS NOT NULL
              AND "dateLivraisonSouhaitee" < CURRENT_DATE
          ) AS "enRetard"
        FROM commandes
        `,
        { type: sequelize.QueryTypes.SELECT }
      ),
      sequelize.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE statut = :livree)                           AS "livrees",
          COALESCE(SUM("montantTotal") FILTER (WHERE statut = :livree), 0)   AS "revenus",
          COALESCE(SUM("fraisLivraison") FILTER (WHERE statut = :livree), 0) AS "fraisEncaisses",
          COALESCE(AVG("fraisLivraison") FILTER (WHERE statut = :livree), 0) AS "fraisMoyens"
        FROM commandes c
        WHERE TRUE ${BORNES}
        `,
        {
          replacements: { ...b, livree: STATUT_COMMANDE.LIVREE },
          type: sequelize.QueryTypes.SELECT,
        }
      ),
    ]);

    return {
      success: true,
      periode: b,
      instantT: {
        aLivrer: nombre(instant[0].aLivrer),
        enPreparation: nombre(instant[0].enPreparation),
        expediees: nombre(instant[0].expediees),
        enRetard: nombre(instant[0].enRetard),
        definitionRetard: 'date de livraison souhaitée dépassée, commande non livrée',
      },
      surLaPeriode: {
        livrees: nombre(periode[0].livrees),
        revenus: nombre(periode[0].revenus),
        fraisEncaisses: nombre(periode[0].fraisEncaisses),
        fraisMoyens: Number(nombre(periode[0].fraisMoyens).toFixed(2)),
        // Le montant facturé au client, pas le coût réel du transport :
        // aucune donnée transporteur n'existe en base.
        natureDesFrais: 'frais facturés au client',
      },
    };
  }

  /**
   * Tableau de bord par vendeur marketplace.
   *
   * Ni commission ni reversement ne figurent ici : aucun taux de commission
   * n'existe en base, et les inventer donnerait des montants faux. La note
   * client provient des avis produits, seule appréciation disponible — il
   * n'y a pas d'enquête post-livraison.
   */
  static async getTableauVendeurs(filtres = {}) {
    const b = normaliserBornes(filtres);
    const lignes = await sequelize.query(
      `
      WITH ventes AS (
        SELECT
          p."vendeurId",
          COUNT(DISTINCT c.id)                                               AS commandes,
          COUNT(DISTINCT c.id) FILTER (WHERE c.statut = :livree)             AS livrees,
          COUNT(DISTINCT c.id) FILTER (WHERE c.statut = :annulee)            AS annulees,
          COALESCE(SUM(ci."sousTotal") FILTER (WHERE c.statut = :livree), 0) AS ca,
          COALESCE(SUM(ci.quantite)    FILTER (WHERE c.statut = :livree), 0) AS articles
        FROM commande_items ci
        JOIN commandes c ON c.id = ci."commandeId"
        JOIN produits  p ON p.id = ci."produitId"
        WHERE p."vendeurId" IS NOT NULL ${BORNES}
        GROUP BY p."vendeurId"
      ),
      catalogue AS (
        SELECT "vendeurId", COUNT(*) AS actifs
        FROM produits WHERE "isActive" = true AND "vendeurId" IS NOT NULL
        GROUP BY "vendeurId"
      ),
      notes AS (
        SELECT p."vendeurId", AVG(a.note) AS note, COUNT(*) AS nb
        FROM avis a JOIN produits p ON p.id = a."produitId"
        WHERE p."vendeurId" IS NOT NULL
        GROUP BY p."vendeurId"
      ),
      -- Les retours se comptent en articles, comme les ventes : rapporter des
      -- retours à un nombre de commandes donnait des taux au-dessus de 100 %.
      -- La période s'applique à la commande d'origine, pas à la date du
      -- retour, pour que numérateur et dénominateur portent sur les mêmes ventes.
      -- Décisions du vendeur sur les commandes qui lui ont été soumises.
      -- Sans borne de période : une décision se rapporte à la commande, déjà
      -- filtree par la CTE ventes, deja restreinte a la fenetre demandee.
      decisions AS (
        SELECT "vendeurId",
               COUNT(*) FILTER (WHERE statut = 'acceptee') AS acceptees,
               COUNT(*) FILTER (WHERE statut = 'refusee')  AS refusees
        FROM acceptations_commande
        GROUP BY "vendeurId"
      ),
      retours_v AS (
        SELECT
          r."vendeurResponsableId" AS id,
          COALESCE(SUM(r.quantite), 0) AS quantite
        FROM retours r
        JOIN commandes c ON c.id = r."commandeId"
        WHERE r.statut <> :refuse
          AND r."vendeurResponsableId" IS NOT NULL
          ${BORNES}
        GROUP BY 1
      )
      SELECT
        u.id, u.nom, u.prenom, u.email,
        pv."nomBoutique",
        COALESCE(v.commandes, 0) AS "commandes",
        COALESCE(v.livrees, 0)   AS "livrees",
        COALESCE(v.annulees, 0)  AS "annulees",
        COALESCE(v.ca, 0)        AS "ca",
        COALESCE(v.articles, 0)  AS "articles",
        COALESCE(ca.actifs, 0)   AS "produitsActifs",
        n.note                   AS "noteClient",
        COALESCE(n.nb, 0)        AS "nombreAvis",
        COALESCE(rv.quantite, 0) AS "articlesRetournes",
        COALESCE(d.acceptees, 0) AS "commandesAcceptees",
        COALESCE(d.refusees, 0)  AS "commandesRefusees"
      FROM users u
      LEFT JOIN profils_vendeurs pv ON pv."userId" = u.id
      LEFT JOIN ventes    v  ON v."vendeurId" = u.id
      LEFT JOIN catalogue ca ON ca."vendeurId" = u.id
      LEFT JOIN notes     n  ON n."vendeurId" = u.id
      LEFT JOIN retours_v rv ON rv.id = u.id
      LEFT JOIN decisions d  ON d."vendeurId" = u.id
      WHERE u.role = :roleVendeur
      ORDER BY COALESCE(v.ca, 0) DESC
      `,
      {
        replacements: {
          ...b,
          livree: STATUT_COMMANDE.LIVREE,
          annulee: STATUT_COMMANDE.ANNULEE,
          refuse: STATUT_RETOUR.REFUSE,
          roleVendeur: ROLES.VENDEUR,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    return {
      success: true,
      periode: b,
      vendeurs: lignes.map((l) => {
        const commandes = nombre(l.commandes);
        const ca = nombre(l.ca);
        return {
          id: l.id,
          nom: l.nom,
          prenom: l.prenom,
          email: l.email,
          nomBoutique: l.nomBoutique,
          chiffreAffaires: ca,
          commandes,
          commandesLivrees: nombre(l.livrees),
          articlesVendus: nombre(l.articles),
          produitsActifs: nombre(l.produitsActifs),
          panierMoyen: commandes ? Number((ca / commandes).toFixed(2)) : 0,
          tauxAnnulation: pourcent(nombre(l.annulees), commandes),
          commandesAcceptees: nombre(l.commandesAcceptees),
          commandesRefusees: nombre(l.commandesRefusees),
          // Rapporté à toutes les commandes soumises : celles encore sans
          // réponse pèsent dans le dénominateur, sinon un vendeur qui ne
          // répond jamais afficherait 100 % d'acceptation.
          tauxAcceptation: pourcent(nombre(l.commandesAcceptees), commandes),
          commandesSansReponse: Math.max(
            0,
            commandes - nombre(l.commandesAcceptees) - nombre(l.commandesRefusees)
          ),
          articlesRetournes: nombre(l.articlesRetournes),
          tauxRetour: pourcent(nombre(l.articlesRetournes), nombre(l.articles)),
          noteClient: l.noteClient === null ? null : Number(Number(l.noteClient).toFixed(2)),
          nombreAvis: nombre(l.nombreAvis),
        };
      }),
    };
  }
}

module.exports = AnalytiqueService;
