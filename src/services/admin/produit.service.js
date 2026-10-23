const { Op } = require('sequelize');
const {
  Produit,
  User,
  Rayon,
  SousRayon,
  ProfilVendeur,
  MouvementStock,
  Commande,
  CommandeItem,
  sequelize,
} = require('../../models');
const { generateUniqueSlug } = require('../../utils/slugify');
const paginate = require('../../utils/paginate');
const logger = require('../../config/logger');
const { uploadImage, deleteImage } = require('../r2.service');
const { sendEmail } = require('../resend.service');
const { STATUT_VALIDATION_PRODUIT, TYPE_MOUVEMENT_STOCK } = require('../../constants');
const NotificationService = require('../notification');
const { tracerAjustementManuel } = require('../mouvementStock.service');

/** Début du jour d'une date de filtre (`null` si absente ou illisible). */
function _jourDebut(valeur) {
  if (!valeur) return null;
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Fin du jour d'une date de filtre : la borne haute reste inclusive. */
function _jourFin(valeur) {
  if (!valeur) return null;
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Indicateurs de l'en-tête de fiche, agrégés par type de mouvement.
 *
 * Les sorties et les ajustements négatifs sont rendus en valeur absolue :
 * « 12 sorties » se lit mieux que « −12 ». Le nombre de commandes vient des
 * lignes de commande (compte distinct), pas des mouvements, pour qu'une
 * commande créée puis annulée ne soit pas comptée deux fois.
 */
function _construireIndicateurs(produit, totauxParType, nombreCommandes) {
  const somme = (type) => {
    const ligne = totauxParType.find((t) => t.type === type);
    return ligne ? Number(ligne.somme) || 0 : 0;
  };

  return {
    stockActuel: Number(produit.stock) || 0,
    totalEntrees: somme(TYPE_MOUVEMENT_STOCK.ENTREE) + somme(TYPE_MOUVEMENT_STOCK.RETOUR),
    totalSorties: Math.abs(somme(TYPE_MOUVEMENT_STOCK.SORTIE)),
    totalAjustementsPositifs: somme(TYPE_MOUVEMENT_STOCK.AJUSTEMENT_POSITIF),
    totalAjustementsNegatifs: Math.abs(somme(TYPE_MOUVEMENT_STOCK.AJUSTEMENT_NEGATIF)),
    nombreCommandes: Number(nombreCommandes) || 0,
  };
}

/**
 * Notifie le vendeur par email. N'échoue jamais : la décision sur le produit
 * est déjà enregistrée, un email indisponible ne doit pas la faire remonter
 * en erreur à l'administrateur.
 */
async function _sendProduitEmail(vendeurId, sujet, html) {
  try {
    const vendeur = await User.findByPk(vendeurId, { attributes: ['email'] });
    if (!vendeur) return;

    const envoi = await sendEmail({ to: vendeur.email, subject: sujet, html });
    if (!envoi.success) {
      logger.error('[Produit] Email non envoyé', { vendeurId, error: envoi.error });
    }
  } catch (err) {
    logger.error('[Produit] Email non envoyé', { vendeurId, error: err.message });
  }
}

class GestionProduitService {
  /**
   * Vérifie que le sous-rayon existe et relève bien du rayon annoncé.
   *
   * Le formulaire envoie les deux identifiants séparément : sans ce contrôle,
   * un appel forgé (ou un rayon changé après coup dans l'interface) rangerait
   * le produit sous un sous-rayon étranger à son rayon.
   */
  static async _verifierRangement(rayonId, sousRayonId) {
    if (!rayonId && !sousRayonId) return null;

    if (rayonId) {
      const rayon = await Rayon.findByPk(rayonId);
      if (!rayon) return 'Rayon introuvable';
    }

    if (sousRayonId) {
      const sousRayon = await SousRayon.findByPk(sousRayonId);
      if (!sousRayon) return 'Sous-rayon introuvable';
      if (rayonId && sousRayon.rayonId !== rayonId) {
        return "Ce sous-rayon n'appartient pas au rayon choisi";
      }
    }

    return null;
  }

  static async createProduit(data, files = []) {
    const erreurRangement = await GestionProduitService._verifierRangement(
      data.rayonId,
      data.sousRayonId
    );
    if (erreurRangement) return { success: false, message: erreurRangement };

    const slug = await generateUniqueSlug(Produit, data.nom);
    const updates = { ...data, slug };

    if (files && files.length) {
      const results = await Promise.allSettled(
        files.map((f) => uploadImage(f.buffer, f.originalname, 'produits'))
      );
      updates.images = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    }

    const produit = await Produit.create(updates);
    return { success: true, message: 'Produit créé avec succès', produit };
  }

  static async updateProduit(id, data, files = []) {
    const produit = await Produit.findByPk(id);
    if (!produit) return { success: false, message: 'Produit introuvable' };

    if ('rayonId' in data || 'sousRayonId' in data) {
      // Une édition peut ne toucher qu'un des deux champs : on complète avec la
      // valeur déjà enregistrée pour comparer la paire réellement obtenue.
      // `in` plutôt que `??` : envoyer null vide volontairement le champ, et
      // `??` serait retombé sur l'ancienne valeur.
      const erreurRangement = await GestionProduitService._verifierRangement(
        'rayonId' in data ? data.rayonId : produit.rayonId,
        'sousRayonId' in data ? data.sousRayonId : produit.sousRayonId
      );
      if (erreurRangement) return { success: false, message: erreurRangement };
    }

    const updates = { ...data };
    if (data.nom && data.nom !== produit.nom) {
      updates.slug = await generateUniqueSlug(Produit, data.nom, id);
    }

    if (files && files.length) {
      const anciennesImages = produit.images || [];
      const results = await Promise.allSettled(
        files.map((f) => uploadImage(f.buffer, f.originalname, 'produits'))
      );
      updates.images = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      if (updates.images.length > 0) {
        await Promise.allSettled(anciennesImages.map((url) => deleteImage(url)));
      }
    }

    await produit.update(updates);
    return { success: true, message: 'Produit mis à jour avec succès', produit };
  }

  static async deleteProduit(id) {
    const produit = await Produit.findByPk(id);
    if (!produit) return { success: false, message: 'Produit introuvable' };
    await produit.update({ isActive: false });
    return { success: true, message: 'Produit désactivé avec succès' };
  }

  static async getProduitById(id) {
    const produit = await Produit.scope('administration').findByPk(id, {
      include: [
        { model: Rayon, as: 'rayon', attributes: ['id', 'nom'], required: false },
        { model: SousRayon, as: 'sousRayon', attributes: ['id', 'nom'], required: false },
        // La fiche sert à instruire une demande de publication : l'admin doit
        // voir qui la soumet.
        {
          model: User,
          as: 'vendeur',
          attributes: ['id', 'nom', 'prenom', 'email', 'telephone'],
          required: false,
          include: [
            {
              model: ProfilVendeur,
              as: 'profilVendeur',
              attributes: ['nomBoutique', 'logo'],
              required: false,
            },
          ],
        },
      ],
    });
    if (!produit) return { success: false, message: 'Produit introuvable' };
    return { success: true, produit };
  }

  static async getAllProduits({
    page,
    limit,
    rayonId,
    sousRayonId,
    statutValidation,
    vendeurId,
    isActive,
    isFeatured,
    prixMin,
    prixMax,
    search,
  } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);

    const where = {};
    if (rayonId) where.rayonId = rayonId;
    if (sousRayonId) where.sousRayonId = sousRayonId;
    // Sans ce filtre, l'écran des demandes de publication listait tout le
    // catalogue : le paramètre était accepté par la route puis ignoré ici.
    if (statutValidation) where.statutValidation = statutValidation;
    if (vendeurId) where.vendeurId = vendeurId;
    if (isActive !== undefined) where.isActive = isActive === 'true' || isActive === true;
    if (isFeatured !== undefined) where.isFeatured = isFeatured === 'true' || isFeatured === true;
    if (prixMin || prixMax) {
      where.prix = {};
      if (prixMin) where.prix[Op.gte] = prixMin;
      if (prixMax) where.prix[Op.lte] = prixMax;
    }
    if (search) {
      where[Op.or] = [
        { nom: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Produit.scope('administration').findAndCountAll({
      where,
      include: [
        { model: Rayon, as: 'rayon', attributes: ['id', 'nom'], required: false },
        { model: SousRayon, as: 'sousRayon', attributes: ['id', 'nom'], required: false },
        // L'écran des demandes affiche qui a soumis le produit. Le nom de la
        // boutique vit sur le profil vendeur, pas sur le compte.
        {
          model: User,
          as: 'vendeur',
          attributes: ['id', 'nom', 'prenom', 'email', 'telephone'],
          required: false,
          include: [
            {
              model: ProfilVendeur,
              as: 'profilVendeur',
              attributes: ['nomBoutique', 'logo'],
              required: false,
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: l,
      offset,
    });

    return {
      success: true,
      message: 'Liste des produits',
      produits: rows,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  /**
   * Ajustement manuel du stock par l'administration.
   *
   * `quantite` est la quantité ABSOLUE visée — la convention que l'endpoint
   * portait déjà ; la différence est calculée pour l'historique plutôt que
   * saisie. `stockAlloue` n'est volontairement pas touché : c'est une demande
   * du vendeur, indépendante du stock réellement ouvert à la vente.
   *
   * La mise à jour et l'écriture du mouvement partagent une transaction, et
   * la ligne produit est verrouillée (`lock: true`) le temps de l'opération :
   * deux ajustements simultanés ne peuvent pas produire un historique dont
   * l'ancienne quantité ne correspond à rien.
   */
  static async updateStock(id, { quantite, motif, commentaire, auteurId } = {}) {
    return await sequelize.transaction(async (t) => {
      const produit = await Produit.findByPk(id, { transaction: t, lock: true });
      if (!produit) return { success: false, message: 'Produit introuvable' };

      const ancienneQuantite = Number(produit.stock) || 0;
      const nouvelleQuantite = Number(quantite);

      await produit.update({ stock: nouvelleQuantite }, { transaction: t });

      const mouvement = await tracerAjustementManuel(
        {
          produitId: produit.id,
          ancienneQuantite,
          nouvelleQuantite,
          motif,
          commentaire: commentaire ? String(commentaire).trim() : null,
          auteurId: auteurId || null,
        },
        t
      );

      return { success: true, message: 'Stock mis à jour avec succès', produit, mouvement };
    });
  }

  /**
   * Historique des mouvements de stock d'un produit, du plus récent au plus
   * ancien, filtré et paginé CÔTÉ SERVEUR.
   *
   * Les filtres portant sur une table jointe (numéro de commande, nom du
   * client) sont d'abord résolus en listes d'identifiants : la requête de
   * liste comme celle des totaux travaillent ensuite sur un `WHERE` qui ne
   * touche que `mouvements_stock`, ce qui garde les totaux exacts et les
   * index utilisables.
   *
   * Les totaux sont calculés sur TOUT l'ensemble filtré, pas sur la page
   * affichée. Les jointures ne servent plus qu'à l'affichage.
   */
  static async getMouvementsStock(id, filtres = {}) {
    const produit = await Produit.findByPk(id, {
      attributes: ['id', 'nom', 'stock', 'stockAlloue', 'reference'],
    });
    if (!produit) return { success: false, message: 'Produit introuvable' };

    const { page, limit, dateDebut, dateFin, type, source, auteurId, motif, clientId, search } =
      filtres;
    const { page: p, limit: l, offset } = paginate(page, limit);

    const where = { produitId: id };

    const debut = _jourDebut(dateDebut);
    const fin = _jourFin(dateFin);
    if (debut || fin) {
      where.createdAt = {};
      if (debut) where.createdAt[Op.gte] = debut;
      if (fin) where.createdAt[Op.lte] = fin;
    }

    if (type && Object.values(TYPE_MOUVEMENT_STOCK).includes(type)) where.type = type;
    if (source) where.source = source;
    if (auteurId) where.auteurId = auteurId;
    if (motif) where.motif = motif;
    if (clientId) where.clientId = clientId;

    // Recherche libre : numéro de commande OU nom / prénom du client. On
    // résout les identifiants d'abord, pour ne pas avoir à joindre dans la
    // requête d'agrégation.
    const terme = typeof search === 'string' ? search.trim() : '';
    if (terme) {
      const [commandes, clients] = await Promise.all([
        Commande.findAll({
          where: { reference: { [Op.iLike]: `%${terme}%` } },
          attributes: ['id'],
          limit: 500,
        }),
        User.findAll({
          where: {
            [Op.or]: [
              { nom: { [Op.iLike]: `%${terme}%` } },
              { prenom: { [Op.iLike]: `%${terme}%` } },
            ],
          },
          attributes: ['id'],
          limit: 500,
        }),
      ]);
      where[Op.or] = [
        { commandeId: { [Op.in]: commandes.map((c) => c.id) } },
        { clientId: { [Op.in]: clients.map((u) => u.id) } },
      ];
    }

    const auteur = {
      model: User,
      as: 'auteur',
      attributes: ['id', 'nom', 'prenom', 'email', 'role'],
      required: false,
    };
    const client = {
      model: User,
      as: 'client',
      attributes: ['id', 'nom', 'prenom', 'email'],
      required: false,
    };
    const commande = {
      model: Commande,
      as: 'commande',
      attributes: ['id', 'reference', 'statut'],
      required: false,
    };

    const [{ count, rows }, totaux, nombreCommandes] = await Promise.all([
      MouvementStock.findAndCountAll({
        where,
        include: [auteur, client, commande],
        order: [['createdAt', 'DESC']],
        limit: l,
        offset,
      }),
      MouvementStock.findAll({
        where,
        attributes: [
          'type',
          [sequelize.fn('SUM', sequelize.col('difference')), 'somme'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'nombre'],
        ],
        group: ['type'],
        raw: true,
      }),
      GestionProduitService._compterCommandes(id, debut, fin),
    ]);

    return {
      success: true,
      message: 'Historique des mouvements de stock',
      produit,
      mouvements: rows,
      indicateurs: _construireIndicateurs(produit, totaux, nombreCommandes),
      periode: { dateDebut: debut, dateFin: fin },
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  /**
   * Nombre de commandes DISTINCTES contenant le produit. Compté sur les
   * lignes de commande, pas sur les mouvements : une commande créée puis
   * annulée produit deux mouvements mais reste une seule commande.
   */
  static async _compterCommandes(produitId, debut, fin) {
    const where = {};
    if (debut || fin) {
      where.createdAt = {};
      if (debut) where.createdAt[Op.gte] = debut;
      if (fin) where.createdAt[Op.lte] = fin;
    }
    return await CommandeItem.count({
      distinct: true,
      col: 'commandeId',
      where: { produitId },
      include: [{ model: Commande, as: 'commande', attributes: [], where, required: true }],
    });
  }

  /**
   * Commandes contenant le produit. Le prix unitaire et le sous-total sont
   * ceux figés dans la ligne de commande au moment de l'achat — jamais
   * recalculés depuis le prix courant du produit, qui a pu changer depuis.
   */
  static async getCommandesDuProduit(id, { page, limit } = {}) {
    const produit = await Produit.findByPk(id, { attributes: ['id', 'nom'] });
    if (!produit) return { success: false, message: 'Produit introuvable' };

    const { page: p, limit: l, offset } = paginate(page, limit);
    const { count, rows } = await CommandeItem.findAndCountAll({
      where: { produitId: id },
      include: [
        {
          model: Commande,
          as: 'commande',
          attributes: ['id', 'reference', 'statut', 'createdAt'],
          required: true,
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'nom', 'prenom', 'email'],
              required: false,
            },
          ],
        },
      ],
      order: [[{ model: Commande, as: 'commande' }, 'createdAt', 'DESC']],
      limit: l,
      offset,
      distinct: true,
    });

    return {
      success: true,
      message: 'Commandes contenant le produit',
      lignes: rows,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async toggleFeatured(id) {
    const produit = await Produit.findByPk(id);
    if (!produit) return { success: false, message: 'Produit introuvable' };
    produit.isFeatured = !produit.isFeatured;
    await produit.save();
    return { success: true, message: 'Produit mis à jour avec succès', produit };
  }

  static async toggleVisibilite(id) {
    const produit = await Produit.findByPk(id);
    if (!produit) return { success: false, message: 'Produit introuvable' };
    produit.isActive = !produit.isActive;
    await produit.save();
    return { success: true, message: 'Produit mis à jour avec succès', produit };
  }

  /**
   * Validation step 1 — protégée contre la double validation simultanée.
   * UPDATE atomique WHERE statutValidation = 'en_attente' uniquement.
   * Si deux admins cliquent en même temps : un seul obtient nbRows=1.
   */
  static async validerProduitStep1(id) {
    const [nbRows] = await Produit.update(
      { statutValidation: STATUT_VALIDATION_PRODUIT.VALIDE_STEP1, isActive: true },
      { where: { id, statutValidation: STATUT_VALIDATION_PRODUIT.EN_ATTENTE } }
    );

    if (nbRows === 0) {
      const produit = await Produit.findByPk(id);
      if (!produit) return { success: false, message: 'Produit introuvable' };
      return {
        success: false,
        message: `Statut actuel: ${produit.statutValidation} — attendu: en_attente`,
      };
    }

    const produit = await Produit.findByPk(id);
    return { success: true, message: 'Étape 1 validée', produit };
  }

  /**
   * Validation step 2 — WHERE statutValidation = 'valide_step1'.
   * Rend le produit visible sur le catalogue.
   */
  static async validerProduitStep2(id) {
    const [nbRows] = await Produit.update(
      { statutValidation: STATUT_VALIDATION_PRODUIT.VALIDE, isActive: true },
      { where: { id, statutValidation: STATUT_VALIDATION_PRODUIT.VALIDE_STEP1 } }
    );

    if (nbRows === 0) {
      const produit = await Produit.findByPk(id);
      if (!produit) return { success: false, message: 'Produit introuvable' };
      return {
        success: false,
        message: `Statut actuel: ${produit.statutValidation} — attendu: valide_step1`,
      };
    }

    const produit = await Produit.findByPk(id);
    // Email et notification sont complémentaires : le mail laisse une trace
    // hors application, la notification alimente la cloche et le push.
    if (produit && produit.vendeurId) {
      await _sendProduitEmail(
        produit.vendeurId,
        `Votre produit "${produit.nom}" a été validé`,
        `<div style="font-family:sans-serif"><p>Bonjour,</p><p>Votre produit <strong>${produit.nom}</strong> a été validé et est maintenant disponible sur Yobante Boutique.</p><p>Merci pour votre confiance !</p></div>`
      );

      await NotificationService.emettre({
        userId: produit.vendeurId,
        titre: 'Demande acceptée',
        message: `« ${produit.nom} » est publié sur le catalogue.`,
        type: 'produit',
        donnees: { produitId: produit.id },
      });
    }
    return { success: true, message: 'Produit validé et publié sur le catalogue', produit };
  }

  static async rejeterProduit(id, motif) {
    // Le motif est persisté : c'est ce que le vendeur lit dans le suivi de sa
    // demande. Auparavant il n'apparaissait que dans la réponse HTTP à l'admin
    // et était donc perdu.
    const [nbRows] = await Produit.update(
      {
        statutValidation: STATUT_VALIDATION_PRODUIT.REJETE,
        isActive: false,
        motifRejet: motif || null,
      },
      { where: { id } }
    );
    if (nbRows === 0) return { success: false, message: 'Produit introuvable' };
    const produit = await Produit.findByPk(id);
    if (produit && produit.vendeurId) {
      await _sendProduitEmail(
        produit.vendeurId,
        `Votre produit "${produit.nom}" n'a pas été validé`,
        `<div style="font-family:sans-serif"><p>Bonjour,</p><p>Votre produit <strong>${produit.nom}</strong> n'a pas été validé.${motif ? ` Motif : ${motif}.` : ''}</p><p>Veuillez contacter l'équipe Yobante pour plus d'informations.</p></div>`
      );

      await NotificationService.emettre({
        userId: produit.vendeurId,
        titre: 'Demande rejetée',
        message: motif ? `« ${produit.nom} » : ${motif}` : `« ${produit.nom} » n’a pas été retenu.`,
        type: 'produit',
        donnees: { produitId: produit.id },
      });
    }
    return { success: true, message: `Produit rejeté${motif ? ` : ${motif}` : ''}`, produit };
  }

  static async getProduitsAValider() {
    const { rows, count } = await Produit.findAndCountAll({
      where: {
        statutValidation: [
          STATUT_VALIDATION_PRODUIT.EN_ATTENTE,
          STATUT_VALIDATION_PRODUIT.VALIDE_STEP1,
        ],
      },
      include: [{ model: User, as: 'vendeur', attributes: ['id', 'nom', 'prenom', 'email'] }],
      order: [['createdAt', 'ASC']],
    });
    return { success: true, produits: rows, total: count };
  }
}

module.exports = GestionProduitService;
