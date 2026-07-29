// ─────────────────────────────────────────────────────────────
// services/admin/blocPromo.service.js
// Blocs promotionnels des sections de l'accueil client.
//
// Une section peut porter plusieurs blocs — ce sont les « sous-sections »
// visibles dans l'application. Ils sont ordonnés par `ordre`.
// ─────────────────────────────────────────────────────────────
const { BlocPromo } = require('../../models');
const { uploadImage, deleteImage } = require('../r2.service');
const { SECTION_PROMOTION } = require('../../constants');

const SECTIONS = Object.values(SECTION_PROMOTION);

/** Champs qu'un administrateur peut renseigner sur un bloc. */
function champsModifiables(data = {}) {
  const updates = {};
  if (data.titre !== undefined) updates.titre = data.titre;
  if (data.sousTitre !== undefined) updates.sousTitre = data.sousTitre;
  if (data.ordre !== undefined) updates.ordre = Number(data.ordre) || 0;
  if (data.isActive !== undefined) {
    updates.isActive = data.isActive === 'true' || data.isActive === true;
  }
  return updates;
}

class BlocPromoService {
  /** Tous les blocs, groupés par section pour l'écran d'administration. */
  static async getAll() {
    const blocs = await BlocPromo.findAll({
      order: [
        ['section', 'ASC'],
        ['ordre', 'ASC'],
      ],
    });

    const parSection = Object.fromEntries(SECTIONS.map((s) => [s, []]));
    for (const bloc of blocs) {
      if (parSection[bloc.section]) parSection[bloc.section].push(bloc);
    }

    return { success: true, blocs, parSection };
  }

  static async getById(id) {
    const bloc = await BlocPromo.findByPk(id);
    if (!bloc) return { success: false, message: 'Bloc introuvable' };
    return { success: true, bloc };
  }

  /** Crée une sous-section dans une section donnée. */
  static async creer(data, file) {
    if (!SECTIONS.includes(data.section)) {
      return { success: false, message: 'Section invalide' };
    }

    // Placé en fin de section par défaut, pour ne pas bousculer l'ordre existant.
    const ordre =
      data.ordre !== undefined
        ? Number(data.ordre) || 0
        : await BlocPromo.count({ where: { section: data.section } });

    const payload = { section: data.section, ...champsModifiables(data), ordre };
    if (file) {
      payload.image = await uploadImage(file.buffer, file.originalname, 'blocs-promo');
    }

    const bloc = await BlocPromo.create(payload);
    return { success: true, message: 'Sous-section créée', bloc };
  }

  static async modifier(id, data, file) {
    const bloc = await BlocPromo.findByPk(id);
    if (!bloc) return { success: false, message: 'Bloc introuvable' };

    const updates = champsModifiables(data);
    if (data.section !== undefined) {
      if (!SECTIONS.includes(data.section)) {
        return { success: false, message: 'Section invalide' };
      }
      updates.section = data.section;
    }

    if (file) {
      // L'ancienne image est retirée du stockage pour ne pas l'accumuler.
      if (bloc.image) await deleteImage(bloc.image);
      updates.image = await uploadImage(file.buffer, file.originalname, 'blocs-promo');
    }

    await bloc.update(updates);
    return { success: true, message: 'Sous-section mise à jour', bloc };
  }

  static async supprimer(id) {
    const bloc = await BlocPromo.findByPk(id);
    if (!bloc) return { success: false, message: 'Bloc introuvable' };
    if (bloc.image) await deleteImage(bloc.image);
    await bloc.destroy();
    return { success: true, message: 'Sous-section supprimée' };
  }

  static async toggleActive(id) {
    const bloc = await BlocPromo.findByPk(id);
    if (!bloc) return { success: false, message: 'Bloc introuvable' };
    await bloc.update({ isActive: !bloc.isActive });
    return { success: true, message: bloc.isActive ? 'Bloc affiché' : 'Bloc masqué', bloc };
  }

  /** Réordonne les sous-sections d'une section : [{ id, ordre }]. */
  static async reordonner(elements = []) {
    if (!Array.isArray(elements) || !elements.length) {
      return { success: false, message: 'Aucun ordre fourni' };
    }
    await Promise.all(
      elements
        .filter((e) => e && e.id)
        .map((e) => BlocPromo.update({ ordre: Number(e.ordre) || 0 }, { where: { id: e.id } }))
    );
    return { success: true, message: 'Ordre mis à jour' };
  }

  /**
   * Met à jour le premier bloc d'une section, en le créant au besoin.
   * Conservé pour l'ancien écran qui ne gérait qu'un bloc par section.
   */
  static async updateBySection(section, data, file) {
    if (!SECTIONS.includes(section)) {
      return { success: false, message: 'Section invalide' };
    }

    const [bloc] = await BlocPromo.findOrCreate({
      where: { section },
      defaults: { section },
    });

    return this.modifier(bloc.id, data, file);
  }
}

module.exports = BlocPromoService;
