/**
 * Verse en base les sections et sous-sections aujourd'hui figées dans
 * l'application mobile.
 *
 * Les visuels vivaient dans `assets/images/` de l'app Flutter : impossible de
 * les changer sans republier. Ce script les téléverse sur Cloudinary et crée
 * les bannières et blocs correspondants, pour que l'administration en reprenne
 * la main depuis le dashboard.
 *
 * Idempotent : un bloc déjà présent (même section, même titre) est laissé tel
 * quel, on ne réimporte pas son image. Relancer le script est sans effet.
 *
 * Usage : node src/seeders/seed-sections-accueil.js [chemin/vers/assets]
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const sequelize = require('../config/db');
const { BlocPromo, Banniere } = require('../models');
const { uploadImage } = require('../services/r2.service');
const { SECTION_PROMOTION } = require('../constants');
const logger = require('../config/logger');

// Emplacement par défaut des visuels de l'app mobile, en voisin du backend.
const ASSETS_PAR_DEFAUT = path.resolve(__dirname, '../../../yobante-boutique-mobile/assets/images');

/**
 * Contenu repris à l'identique de l'accueil mobile.
 * `fichier` référence un visuel livré avec l'application.
 */
const BANNIERES = [{ titre: 'Bannière principale', fichier: 'banniere du haut.png', ordre: 0 }];

const BLOCS = [
  {
    section: SECTION_PROMOTION.NOS_PROMOS_DU_MOMENT,
    titre: 'Promo du moment 1',
    sousTitre: null,
    fichier: 'promo1.png',
    ordre: 0,
  },
  {
    section: SECTION_PROMOTION.NOS_PROMOS_DU_MOMENT,
    titre: 'Promo du moment 2',
    sousTitre: null,
    fichier: 'promo2.png',
    ordre: 1,
  },
  {
    section: SECTION_PROMOTION.NOS_PROMOS_DU_MOMENT,
    titre: 'Promo du moment 3',
    sousTitre: null,
    fichier: 'promo3.png',
    ordre: 2,
  },
  {
    section: SECTION_PROMOTION.NOS_PROMOS_A_VENIR,
    titre: 'Tabaski',
    sousTitre: 'Bientôt disponible',
    fichier: 'tabaski.png',
    ordre: 0,
  },
  {
    section: SECTION_PROMOTION.NOS_PROMOS_A_VENIR,
    titre: 'Rentrée des classes',
    sousTitre: 'Bientôt disponible',
    fichier: 'rentree des classes.png',
    ordre: 1,
  },
  {
    section: SECTION_PROMOTION.NOS_PROMOS_A_VENIR,
    titre: 'Black Friday',
    sousTitre: 'Bientôt disponible',
    fichier: 'black friday.png',
    ordre: 2,
  },
  // « À ne pas rater » n'avait aucune image : l'app y affichait des cartes
  // dégradées avec du texte. On crée les sous-sections correspondantes, sans
  // visuel — l'administration pourra en déposer un depuis le dashboard.
  {
    section: SECTION_PROMOTION.A_NE_PAS_RATER,
    titre: "Jusqu'à -50 %",
    sousTitre: 'sur une sélection de produits',
    fichier: null,
    ordre: 0,
  },
  {
    section: SECTION_PROMOTION.A_NE_PAS_RATER,
    titre: 'Livraison gratuite',
    sousTitre: 'en point relais à Touba',
    fichier: null,
    ordre: 1,
  },
  {
    section: SECTION_PROMOTION.A_NE_PAS_RATER,
    titre: 'Nouveau : Électro',
    sousTitre: 'Découvrez nos nouveautés',
    fichier: null,
    ordre: 2,
  },
];

let uploadsEchoues = 0;

/**
 * Téléverse un visuel local et renvoie son URL.
 *
 * Renvoie null si le fichier manque ou si Cloudinary refuse : la sous-section
 * est alors créée sans image. Mieux vaut une structure en place, dont
 * l'administration complétera les visuels depuis le dashboard, qu'un import
 * interrompu au premier échec.
 */
async function televerser(dossier, fichier, sousDossier) {
  if (!fichier) return null;

  const chemin = path.join(dossier, fichier);
  if (!fs.existsSync(chemin)) {
    logger.warn(`Visual not found, ignored: ${fichier}`);
    return null;
  }

  try {
    const url = await uploadImage(fs.readFileSync(chemin), fichier, sousDossier);
    logger.info(`Visual uploaded: ${fichier}`);
    return url;
  } catch (err) {
    uploadsEchoues++;
    logger.warn(`Upload refused (${err.message}): ${fichier}`);
    return null;
  }
}

async function seedSectionsAccueil(dossierAssets = ASSETS_PAR_DEFAUT) {
  if (!fs.existsSync(dossierAssets)) {
    throw new Error(`Visual folder not found: ${dossierAssets}`);
  }

  logger.info(`Loading visuals from: ${dossierAssets}`);

  // ── Bannières ───────────────────────────────────────────────────────────
  logger.info('Seeding banners');
  for (const banniere of BANNIERES) {
    const existante = await Banniere.findOne({ where: { titre: banniere.titre } });
    if (existante) {
      logger.info(`Banner already exists: ${banniere.titre}`);
      continue;
    }

    const image = await televerser(dossierAssets, banniere.fichier, 'bannieres');
    // Une bannière sans image n'a pas de sens : le mobile n'aurait rien à
    // afficher. On la crée seulement si le visuel est passé.
    if (!image) {
      logger.info(`Banner skipped (no visual): ${banniere.titre}`);
      continue;
    }

    await Banniere.create({
      titre: banniere.titre,
      image,
      ordre: banniere.ordre,
      isActive: true,
    });
    logger.info(`Banner created: ${banniere.titre}`);
  }

  // ── Sous-sections ───────────────────────────────────────────────────────
  logger.info('Seeding promotional blocks');
  for (const bloc of BLOCS) {
    const existant = await BlocPromo.findOne({
      where: { section: bloc.section, titre: bloc.titre },
    });
    if (existant) {
      logger.info(`Block already exists: ${bloc.section} / ${bloc.titre}`);
      continue;
    }

    const image = await televerser(dossierAssets, bloc.fichier, 'blocs-promo');

    await BlocPromo.create({
      section: bloc.section,
      titre: bloc.titre,
      sousTitre: bloc.sousTitre,
      image,
      ordre: bloc.ordre,
      isActive: true,
    });
    logger.info(`Block created: ${bloc.section} / ${bloc.titre}`);
  }
}

module.exports = seedSectionsAccueil;

// Exécution directe : `node src/seeders/seed-sections-accueil.js`
if (require.main === module) {
  const dossier = process.argv[2] || ASSETS_PAR_DEFAUT;
  sequelize
    .authenticate()
    .then(() => seedSectionsAccueil(dossier))
    .then(async () => {
      const blocs = await BlocPromo.count();
      const bannieres = await Banniere.count();
      logger.info(
        `Seed completed — ${bannieres} banner(s), ${blocs} promotional block(s) in database`
      );
      if (uploadsEchoues > 0) {
        logger.warn(
          `${uploadsEchoues} visual(s) not uploaded: Cloudinary rejected credentials. ` +
            'Blocks exist without images; upload them from the dashboard or rerun this script ' +
            'in an environment where Cloudinary is configured.'
        );
      }
      await sequelize.close();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error('Sections seed failed', { error: err.message });
      await sequelize.close();
      process.exit(1);
    });
}
