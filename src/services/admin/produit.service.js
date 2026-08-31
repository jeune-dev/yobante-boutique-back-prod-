const { Op } = require('sequelize');
const { Produit, User, Rayon, SousRayon, ProfilVendeur } = require('../../models');
const { generateUniqueSlug } = require('../../utils/slugify');
const paginate = require('../../utils/paginate');
const logger = require('../../config/logger');
const { uploadImage, deleteImage } = require('../r2.service');
const { sendEmail } = require('../resend.service');
const { STATUT_VALIDATION_PRODUIT } = require('../../constants');
const NotificationService = require('../notification');

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
    const produit = await Produit.findByPk(id, {
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

    const { count, rows } = await Produit.findAndCountAll({
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

  static async updateStock(id, quantite) {
    const produit = await Produit.findByPk(id);
    if (!produit) return { success: false, message: 'Produit introuvable' };
    await produit.update({ stock: quantite });
    return { success: true, message: 'Stock mis à jour avec succès', produit };
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
