const { Reversement, User, sequelize } = require('../../models');
const paginate = require('../../utils/paginate');
const {
  STATUT_COMMANDE,
  STATUT_RETOUR,
  STATUT_REVERSEMENT,
  ROLES,
  TAUX_COMMISSION_DEFAUT,
} = require('../../constants');

/**
 * Finance marketplace : commissions, revenus de la plateforme, reversements.
 *
 * Principe retenu : **aucun solde n'est stocké**. Le montant dû à un vendeur
 * se recalcule à chaque lecture depuis ses ventes livrées, moins la
 * commission, moins ce qui lui a déjà été reversé. Un solde enregistré
 * divergerait du réel au premier retour, à la première annulation ou au
 * premier changement de taux — et serait alors faux sans que personne ne
 * s'en aperçoive.
 *
 * La commission ne porte que sur les ventes **marketplace** : un produit sans
 * vendeur est vendu par la plateforme pour son propre compte, il n'y a rien
 * à prélever ni à reverser.
 */

const BORNES = `
  AND (CAST(:debut AS timestamptz) IS NULL OR c."createdAt" >= CAST(:debut AS timestamptz))
  AND (CAST(:fin   AS timestamptz) IS NULL OR c."createdAt" <= CAST(:fin   AS timestamptz))
`;

function normaliserBornes({ debut, fin } = {}) {
  return {
    debut: debut ? new Date(debut).toISOString() : null,
    fin: fin ? new Date(new Date(fin).setHours(23, 59, 59, 999)).toISOString() : null,
  };
}

const nombre = (v) => Number(v) || 0;
const arrondi = (v) => Number((Number(v) || 0).toFixed(2));
const pourcent = (part, total) => (total ? Number(((part / total) * 100).toFixed(1)) : 0);

/**
 * Ventes marketplace par vendeur, commission appliquée ligne à ligne.
 *
 * Le taux est résolu en SQL (`COALESCE` sur le profil puis le défaut) plutôt
 * qu'en JavaScript : appliquer un taux moyen au total d'un vendeur donnerait
 * un résultat différent dès qu'un taux change en cours de période.
 */
const VENTES_PAR_VENDEUR = `
  SELECT
    p."vendeurId"                                                     AS "vendeurId",
    COALESCE(pv."tauxCommission", :tauxDefaut)                        AS "taux",
    COALESCE(SUM(ci."sousTotal"), 0)                                  AS "ca",
    COALESCE(SUM(ci."sousTotal" * COALESCE(pv."tauxCommission", :tauxDefaut) / 100), 0) AS "commission",
    COUNT(DISTINCT c.id)                                              AS "commandes"
  FROM commande_items ci
  JOIN commandes c ON c.id = ci."commandeId"
  JOIN produits  p ON p.id = ci."produitId"
  LEFT JOIN profils_vendeurs pv ON pv."userId" = p."vendeurId"
  WHERE p."vendeurId" IS NOT NULL
    AND c.statut = :livree
    ${BORNES}
  GROUP BY p."vendeurId", pv."tauxCommission"
`;

class FinanceService {
  /** Synthèse financière de la période : qui encaisse quoi. */
  static async getSynthese(filtres = {}) {
    const b = normaliserBornes(filtres);
    const repl = {
      ...b,
      livree: STATUT_COMMANDE.LIVREE,
      tauxDefaut: TAUX_COMMISSION_DEFAUT,
    };

    const [ventes, marketplace, remboursements, reversements] = await Promise.all([
      sequelize.query(
        `
        SELECT
          COALESCE(SUM(ci."sousTotal"), 0)                                         AS "caTotal",
          COALESCE(SUM(ci."sousTotal") FILTER (WHERE p."vendeurId" IS NULL), 0)    AS "caPropre",
          COALESCE(SUM(ci.quantite * p."prixAchat") FILTER (WHERE p."vendeurId" IS NULL), 0) AS "coutAchatPropre"
        FROM commande_items ci
        JOIN commandes c ON c.id = ci."commandeId"
        JOIN produits  p ON p.id = ci."produitId"
        WHERE c.statut = :livree ${BORNES}
        `,
        { replacements: repl, type: sequelize.QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COALESCE(SUM("ca"), 0) AS "ca", COALESCE(SUM("commission"), 0) AS "commission"
         FROM (${VENTES_PAR_VENDEUR}) t`,
        { replacements: repl, type: sequelize.QueryTypes.SELECT }
      ),
      sequelize.query(
        `
        SELECT
          COALESCE(SUM(r."montantRembourse"), 0) AS "montant",
          COUNT(*)                               AS "nombre"
        FROM retours r
        JOIN commandes c ON c.id = r."commandeId"
        WHERE r.statut <> :refuse ${BORNES}
        `,
        {
          replacements: { ...repl, refuse: STATUT_RETOUR.REFUSE },
          type: sequelize.QueryTypes.SELECT,
        }
      ),
      // Les reversements se lisent sur leur propre date, pas sur celle des
      // commandes : un versement de janvier peut solder des ventes de décembre.
      sequelize.query(
        `
        SELECT
          COALESCE(SUM(montant) FILTER (WHERE statut = :paye), 0)       AS "payes",
          COALESCE(SUM(montant) FILTER (WHERE statut = :enAttente), 0)  AS "enAttente",
          COUNT(*) FILTER (WHERE statut = :enAttente)                   AS "nbEnAttente"
        FROM reversements
        WHERE (CAST(:debut AS timestamptz) IS NULL OR "createdAt" >= CAST(:debut AS timestamptz))
          AND (CAST(:fin   AS timestamptz) IS NULL OR "createdAt" <= CAST(:fin   AS timestamptz))
        `,
        {
          replacements: {
            ...b,
            paye: STATUT_REVERSEMENT.PAYE,
            enAttente: STATUT_REVERSEMENT.EN_ATTENTE,
          },
          type: sequelize.QueryTypes.SELECT,
        }
      ),
    ]);

    const caTotal = nombre(ventes[0].caTotal);
    const caPropre = nombre(ventes[0].caPropre);
    const caMarketplace = nombre(marketplace[0].ca);
    const commission = arrondi(marketplace[0].commission);
    const montantVendeurs = arrondi(caMarketplace - commission);
    const margePropre = arrondi(caPropre - nombre(ventes[0].coutAchatPropre));
    const rembourse = nombre(remboursements[0].montant);

    // Frais de livraison : encaissés avec la commande, ils reviennent à la
    // plateforme, qui porte le transport.
    const frais = await sequelize.query(
      `SELECT COALESCE(SUM("fraisLivraison"), 0) AS "frais"
       FROM commandes c WHERE c.statut = :livree ${BORNES}`,
      { replacements: repl, type: sequelize.QueryTypes.SELECT }
    );
    const fraisLivraison = nombre(frais[0].frais);

    const revenuPlateforme = arrondi(commission + margePropre + fraisLivraison - rembourse);

    return {
      success: true,
      periode: b,
      synthese: {
        caTotal,
        caMarketplace,
        caPropre,
        partMarketplace: pourcent(caMarketplace, caTotal),
        commission,
        tauxCommissionMoyen: pourcent(commission, caMarketplace),
        montantVendeurs,
        margePropre,
        fraisLivraison,
        remboursements: rembourse,
        nombreRemboursements: nombre(remboursements[0].nombre),
        // Ce que garde réellement la plateforme : sa commission, sa marge sur
        // ses propres produits et les frais encaissés, moins les remboursements.
        revenuPlateforme,
        formuleRevenu:
          'commission + marge sur ventes propres + frais de livraison − remboursements',
        reversementsPayes: nombre(reversements[0].payes),
        reversementsEnAttente: nombre(reversements[0].enAttente),
        nombreReversementsEnAttente: nombre(reversements[0].nbEnAttente),
        tauxCommissionDefaut: TAUX_COMMISSION_DEFAUT,
      },
    };
  }

  /**
   * Compte de chaque vendeur : ce qu'il a vendu, ce qui a été prélevé, ce qui
   * lui reste dû.
   *
   * Les reversements déduits sont pris **sans borne de période** : un versement
   * se rapporte à des ventes antérieures, le filtrer sur la même fenêtre que
   * les ventes ferait apparaître des dettes déjà soldées.
   */
  static async getComptesVendeurs(filtres = {}) {
    const b = normaliserBornes(filtres);
    const repl = { ...b, livree: STATUT_COMMANDE.LIVREE, tauxDefaut: TAUX_COMMISSION_DEFAUT };

    const [ventes, verses] = await Promise.all([
      sequelize.query(
        `
        SELECT v.*, u.nom, u.prenom, u.email, pv."nomBoutique"
        FROM (${VENTES_PAR_VENDEUR}) v
        JOIN users u ON u.id = v."vendeurId"
        LEFT JOIN profils_vendeurs pv ON pv."userId" = u.id
        ORDER BY v."ca" DESC
        `,
        { replacements: repl, type: sequelize.QueryTypes.SELECT }
      ),
      sequelize.query(
        `
        SELECT "vendeurId",
               COALESCE(SUM(montant) FILTER (WHERE statut = :paye), 0)      AS "paye",
               COALESCE(SUM(montant) FILTER (WHERE statut = :enAttente), 0) AS "enAttente"
        FROM reversements
        WHERE statut <> :annule
        GROUP BY "vendeurId"
        `,
        {
          replacements: {
            paye: STATUT_REVERSEMENT.PAYE,
            enAttente: STATUT_REVERSEMENT.EN_ATTENTE,
            annule: STATUT_REVERSEMENT.ANNULE,
          },
          type: sequelize.QueryTypes.SELECT,
        }
      ),
    ]);

    const parVendeur = new Map(verses.map((v) => [v.vendeurId, v]));

    return {
      success: true,
      periode: b,
      comptes: ventes.map((v) => {
        const ca = nombre(v.ca);
        const commission = arrondi(v.commission);
        const dus = arrondi(ca - commission);
        const r = parVendeur.get(v.vendeurId);
        const paye = nombre(r?.paye);
        const enAttente = nombre(r?.enAttente);

        return {
          vendeurId: v.vendeurId,
          nom: v.nom,
          prenom: v.prenom,
          email: v.email,
          nomBoutique: v.nomBoutique,
          tauxCommission: Number(v.taux),
          tauxParDefaut: v.taux === null,
          chiffreAffaires: ca,
          commandes: nombre(v.commandes),
          commission,
          montantVendeur: dus,
          dejaReverse: paye,
          reversementsEnAttente: enAttente,
          // Peut être négatif si l'on a déjà reversé plus que les ventes de la
          // période : c'est le signe d'un versement couvrant une autre période,
          // pas d'une erreur, et masquer le signe empêcherait de le voir.
          resteDu: arrondi(dus - paye - enAttente),
        };
      }),
    };
  }

  static async listerReversements({ page, limit, vendeurId, statut } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);
    const where = {};
    if (vendeurId) where.vendeurId = vendeurId;
    if (statut) where.statut = statut;

    const { count, rows } = await Reversement.findAndCountAll({
      where,
      include: [
        { model: User, as: 'vendeur', attributes: ['id', 'nom', 'prenom', 'email'] },
        { model: User, as: 'auteur', attributes: ['id', 'nom', 'prenom'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: l,
      offset,
    });

    return {
      success: true,
      reversements: rows,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async creerReversement({
    vendeurId,
    montant,
    methode,
    periodeDebut,
    periodeFin,
    note,
    adminId,
  }) {
    const vendeur = await User.findOne({ where: { id: vendeurId, role: ROLES.VENDEUR } });
    if (!vendeur) return { success: false, status: 404, message: 'Vendeur introuvable' };
    if (!(Number(montant) > 0)) {
      return { success: false, status: 400, message: 'Le montant doit être supérieur à zéro' };
    }

    const reversement = await Reversement.create({
      vendeurId,
      // Référence lisible et unique, pour rapprocher un versement d'un relevé.
      reference: `REV-${Date.now().toString(36).toUpperCase()}`,
      montant: arrondi(montant),
      statut: STATUT_REVERSEMENT.EN_ATTENTE,
      methode: methode || null,
      periodeDebut: periodeDebut || null,
      periodeFin: periodeFin || null,
      note: note?.trim() || null,
      creePar: adminId || null,
    });

    return { success: true, message: 'Reversement enregistré', reversement };
  }

  /** Change le statut d'un reversement. `paye` horodate le versement. */
  static async changerStatutReversement(id, { statut, adminId }) {
    if (!Object.values(STATUT_REVERSEMENT).includes(statut)) {
      return { success: false, status: 400, message: 'Statut de reversement inconnu' };
    }

    const reversement = await Reversement.findByPk(id);
    if (!reversement) return { success: false, status: 404, message: 'Reversement introuvable' };
    if (reversement.statut === statut) {
      return { success: false, status: 400, message: `Ce reversement est déjà « ${statut} »` };
    }

    await reversement.update({
      statut,
      payeLe: statut === STATUT_REVERSEMENT.PAYE ? new Date() : null,
      creePar: reversement.creePar || adminId || null,
    });

    return { success: true, message: 'Reversement mis à jour', reversement };
  }

  /** Change le taux de commission négocié avec un vendeur. */
  static async definirTauxCommission(vendeurId, taux) {
    const valeur = taux === null || taux === '' ? null : Number(taux);
    if (valeur !== null && (!Number.isFinite(valeur) || valeur < 0 || valeur > 100)) {
      return { success: false, status: 400, message: 'Le taux doit être compris entre 0 et 100' };
    }

    const { ProfilVendeur } = require('../../models');
    // `administration` : le scope par défaut exclut `tauxCommission`, et
    // l'instance chargée sans lui ne pourrait pas le relire après écriture.
    const profil = await ProfilVendeur.scope('administration').findOne({
      where: { userId: vendeurId },
    });
    if (!profil) return { success: false, status: 404, message: 'Profil vendeur introuvable' };

    await profil.update({ tauxCommission: valeur });
    return {
      success: true,
      message:
        valeur === null
          ? `Taux par défaut rétabli (${TAUX_COMMISSION_DEFAUT} %)`
          : `Taux fixé à ${valeur} %`,
      tauxCommission: valeur,
    };
  }
}

module.exports = FinanceService;
