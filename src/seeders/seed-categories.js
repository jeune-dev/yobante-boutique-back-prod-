// seed-categories.js — À exécuter UNE seule fois : node src/seeders/seed-categories.js
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const sequelize = require('../config/db');
const Categorie = require('../models/Categorie.model');
// ✅ PERF: Utiliser logger au lieu de console.log
const logger = require('../config/logger');

const slugify = (str) =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const RAYONS = [
  {
    nom: 'Promotions',
    description: 'Récapitule les promos de tous les rayons avec un compte à rebours',
    sous: [],
  },
  {
    nom: 'Produits Locaux',
    sous: ['Boissons locales', 'Gourmandises du pays'],
  },
  {
    nom: 'Cafés',
    sous: [
      'Dosettes et capsules',
      'Cafés en grains',
      'Cafés moulus',
      'Cafés concentrés',
      'Cafés solubles',
      'Filtres et détartrants',
    ],
  },
  {
    nom: 'Mode et Textile de chez nous',
    sous: ['Chaussures locales', 'Maroquinerie', 'Habillement local', 'Bijoux'],
  },
  {
    nom: 'Traiteur',
    sous: ['Entrées', 'Plats', 'Desserts'],
  },
  {
    nom: 'Mobilier et Décoration',
    sous: [
      'Linge de maison',
      'Literie',
      'Cuisson et ustensiles de cuisine',
      'Vaisselle et art de la table',
      'Mobilier et décoration',
    ],
  },
  {
    nom: 'Fruits et Légumes',
    sous: ['Fruits', 'Légumes', 'Prêt à consommer', 'Fruits et légumes secs', 'Graines'],
  },
  {
    nom: 'Viande et Poissons',
    sous: ['Boucherie', 'Volaille et rôtisserie', 'Poissonnerie', 'Traiteur de la mer'],
  },
  {
    nom: 'Crèmerie et Produits Laitiers',
    sous: ['Yaourts', 'Desserts et compotes', 'Œufs'],
  },
  {
    nom: 'Charcuterie et Traiteur',
    sous: ['Charcuterie', 'Entrées et salades', 'Pizza', 'Plats cuisinés'],
  },
  {
    nom: 'Surgelés',
    sous: [
      'Glaces',
      'Fruits et légumes surgelés',
      'Poisson surgelé',
      'Viande surgelée',
      'Pizza surgelée',
      'Glaçons',
    ],
  },
  {
    nom: 'Bébé',
    sous: [
      'Change et soins',
      'Bain et toilette',
      'Vêtements bébé',
      'Promenade',
      'Chambre bébé',
      'Éveil',
    ],
  },
  {
    nom: 'Épicerie Sucrée',
    sous: [
      'Petit déjeuner',
      'Thés, infusions et boissons chaudes',
      'Confiserie et chocolat',
      'Biscuits et gâteaux',
      'Compotes et fruits au sirop',
      'Crèmes dessert',
      'Sucre',
      'Farines et aide à la pâtisserie',
    ],
  },
  {
    nom: 'Épicerie Salée',
    sous: [
      'Huiles, vinaigres et vinaigrettes',
      'Pâtes',
      'Sauces chaudes',
      'Sauces froides',
      'Conserves et bocaux',
      'Riz, purée et féculents',
      'Cornichons et condiments',
      'Sels, épices et bouillons',
      'Soupes',
    ],
  },
  {
    nom: 'Boissons',
    sous: ['Colas, sirops et sodas', 'Eaux', 'Jus de fruits'],
  },
  {
    nom: 'Pains et Pâtisserie',
    sous: [
      'Gâteaux à partager',
      'Pâtisseries individuelles',
      'Tartes',
      'Macarons et mignardises',
      'Beignets',
      'Muffins',
    ],
  },
  {
    nom: 'Entretien et Nettoyage',
    sous: [
      'Anti-moustiques et insecticides',
      'Lessives',
      'Adoucissants et soin du linge',
      'Produits nettoyants',
      'Essuie-tout',
      'Papier toilette et mouchoirs',
      'Désodorisants',
      'Accessoires de ménage',
    ],
  },
  {
    nom: 'Hygiène et Beauté',
    sous: [
      'Produits solaires',
      'Soins du visage',
      'Soins du corps',
      'Soins des cheveux',
      'Hygiène dentaire',
      'Hygiène intime',
      'Hommes',
      'Maquillage',
      'Enfants premiers soins',
      'Incontinence',
      'Cotons',
    ],
  },
  {
    nom: 'Animalerie',
    sous: ['Chien', 'Chat', 'Basse-cour', 'Poisson'],
  },
  {
    nom: 'Jeux Vidéo',
    sous: ['Consoles', 'Jeux', 'Accessoires jeux vidéo'],
  },
  {
    nom: 'Smartphone et Objets Connectés',
    sous: [
      'Téléphones',
      'Montres et bracelets connectés',
      'Cartes mémoire',
      'Batteries externes',
      'Objets connectés',
    ],
  },
  {
    nom: 'Informatique et Bureau',
    sous: [
      'Ordinateurs portables',
      'Ordinateurs de bureau',
      'Écrans PC',
      'Tablettes et iPad',
      'Imprimantes et scanners',
      'Cartouches, toner et papier',
      'Casques, micros et enceintes',
      'Stockage',
      'Souris, claviers et tapis',
      'Accessoires informatique',
    ],
  },
  {
    nom: 'Image et Son',
    sous: [
      'Téléviseurs',
      'Barres de son',
      'Home cinéma',
      'Casques et écouteurs',
      'Enceintes Bluetooth et radio',
    ],
  },
  {
    nom: 'Sport',
    sous: ['Chaussures de sport', 'Tenues de sport'],
  },
  {
    nom: 'Mode et Textile',
    sous: ['Chaussures', 'Habillement', 'Montres', 'Bijoux'],
  },
];

async function seed() {
  await sequelize.authenticate();
  logger.info('PostgreSQL connection established');

  let created = 0;
  let skipped = 0;

  for (const rayon of RAYONS) {
    const parentSlug = slugify(rayon.nom);

    // Créer ou récupérer la catégorie parente
    let parent = await Categorie.findOne({ where: { slug: parentSlug } });
    if (!parent) {
      parent = await Categorie.create({
        id: uuidv4(),
        nom: rayon.nom,
        slug: parentSlug,
        description: rayon.description ?? null,
        isActive: true,
        parentId: null,
      });
      logger.info(`Category created: ${rayon.nom}`);
      created++;
    } else {
      logger.info(`Category already exists: ${rayon.nom}`);
      skipped++;
    }

    // Créer les sous-catégories
    for (const sous of rayon.sous) {
      const sousSlug = slugify(`${rayon.nom}-${sous}`);
      const exists = await Categorie.findOne({ where: { slug: sousSlug } });
      if (!exists) {
        await Categorie.create({
          id: uuidv4(),
          nom: sous,
          slug: sousSlug,
          isActive: true,
          parentId: parent.id,
        });
        logger.info(`Subcategory created: ${sous}`);
        created++;
      } else {
        skipped++;
      }
    }
  }

  logger.info(`Seed completed: ${created} categories created, ${skipped} already existed`);
  await sequelize.close();
}

seed().catch((err) => {
  logger.error(`Seed error: ${err.message}`);
  process.exit(1);
});
