/**
 * Rayons et sous-rayons de référence (catalogue d'octobre 2026).
 *
 * Partagé par la migration de remplacement du catalogue
 * (20261011000003-catalogue-rayons.js), le seeder local (seed-rayons.js) et le
 * seeder distant (scripts/seed-rayons-distant.js) : une seule liste à tenir.
 *
 * L'ordre est celui d'affichage dans l'application (colonne `ordre`).
 *
 * « Promotions » est un rayon à part : il n'a pas de sous-rayon et
 * l'application l'ouvre sur toutes les promotions en cours, avec leur compte
 * à rebours (slug `promotions`).
 */
'use strict';

const SLUG_RAYON_PROMOTIONS = 'promotions';

const RAYONS = [
  {
    nom: 'Promotions',
    description:
      'Toutes les promotions en cours, tous rayons confondus, avec leur compte à rebours.',
    sousRayons: [],
  },
  { nom: 'Produits locaux', sousRayons: ['Boissons', 'Gourmandises du pays'] },
  {
    nom: 'Épicerie sucrée',
    sousRayons: [
      'Cafés',
      'Petit-déjeuner',
      'Thés, infusions et boissons chaudes',
      'Confiserie et chocolat',
      'Biscuits et gâteaux',
      'Compotes, fruits au sirop et crèmes dessert',
      'Sucre, farines et aides à la pâtisserie',
    ],
  },
  {
    nom: 'Cafés',
    sousRayons: [
      'Dosettes et capsules',
      'Cafés en grains',
      'Cafés moulus',
      'Cafés concentrés',
      'Cafés solubles',
      'Filtres et détartrants',
    ],
  },
  {
    nom: 'Épicerie salée',
    sousRayons: [
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
  { nom: 'Crèmerie et produits laitiers', sousRayons: ['Yaourts', 'Desserts et compotes', 'Œufs'] },
  {
    nom: 'Fruits et légumes',
    sousRayons: ['Fruits', 'Légumes', 'Prêt à consommer', 'Fruits et légumes secs', 'Graines'],
  },
  {
    nom: 'Viandes et poissons',
    sousRayons: ['Boucherie', 'Volaille et rôtisserie', 'Poissonnerie', 'Traiteur de la mer'],
  },
  {
    nom: 'Charcuterie et traiteur',
    sousRayons: ['Charcuterie', 'Entrées et salades', 'Pizzas', 'Plats cuisinés'],
  },
  { nom: 'Boissons', sousRayons: ['Colas, sirops et sodas', 'Eaux', 'Jus de fruits'] },
  {
    nom: 'Bébé',
    sousRayons: [
      'Change et soins',
      'Bain et toilette',
      'Vêtements',
      'Promenade',
      'Chambre',
      'Éveil',
    ],
  },
  {
    nom: 'Pains et pâtisserie',
    sousRayons: [
      'Gâteaux à partager',
      'Pâtisseries individuelles',
      'Tartes',
      'Macarons et mignardises',
      'Beignets',
      'Muffins',
    ],
  },
  { nom: 'Traiteur', sousRayons: ['Entrées', 'Plats', 'Desserts'] },
  {
    nom: 'Surgelés',
    sousRayons: ['Glaces', 'Fruits et légumes', 'Poissons', 'Viandes', 'Pizzas', 'Glaçons'],
  },
  {
    nom: 'Entretien et nettoyage',
    sousRayons: [
      'Anti-moustiques et insecticides',
      'Lessives, adoucissants et soin du linge',
      'Produits nettoyants',
      'Essuie-tout, papier toilette et mouchoirs',
      'Désodorisants',
      'Accessoires de ménage',
    ],
  },
  {
    nom: 'Hygiène et beauté',
    sousRayons: [
      'Produits solaires',
      'Soins du visage',
      'Soins du corps',
      'Soins des cheveux',
      'Hygiène dentaire',
      'Hygiène intime',
      'Hommes',
      'Maquillage',
      'Enfants et premiers soins',
      'Incontinence',
      'Cotons',
    ],
  },
  {
    nom: 'Mobilier et décoration',
    sousRayons: [
      'Linge de maison',
      'Literie',
      'Cuisson et ustensiles de cuisine',
      'Vaisselle et art de la table',
      'Mobilier et décoration',
    ],
  },
  { nom: 'Animalerie', sousRayons: ['Chien', 'Chat', 'Basse-cour', 'Poissons'] },
  { nom: 'Jeux vidéo', sousRayons: ['Consoles', 'Jeux', 'Accessoires'] },
  {
    nom: 'Smartphones et objets connectés',
    sousRayons: [
      'Téléphones',
      'Montres et bracelets connectés',
      'Cartes mémoire',
      'Batteries externes',
      'Objets connectés',
    ],
  },
  {
    nom: 'Informatique et bureau',
    sousRayons: [
      'Ordinateurs portables',
      'Ordinateurs de bureau',
      'Écrans PC',
      'Tablettes et iPad',
      'Imprimantes et scanners',
      'Cartouches, toners et papier',
      'Casques, micros et enceintes',
      'Stockage',
      'Souris, claviers et tapis',
      'Accessoires informatiques',
    ],
  },
  {
    nom: 'Image et son',
    sousRayons: [
      'Téléviseurs',
      'Barres de son',
      'Home cinéma',
      'Casques et écouteurs',
      'Enceintes Bluetooth et radios',
    ],
  },
  { nom: 'Sport', sousRayons: ['Chaussures', 'Tenues de sport'] },
  { nom: 'Mode et textile', sousRayons: ['Chaussures', 'Habillement', 'Montres', 'Bijoux'] },
  {
    nom: 'Mode et textile de chez nous',
    sousRayons: ['Chaussures', 'Maroquinerie', 'Habillement', 'Bijoux'],
  },
];

/** Slug stable : clé d'idempotence des scripts, identique au dashboard. */
function slugifier(texte) {
  return String(texte)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/gi, 'oe')
    .toLowerCase()
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { RAYONS, SLUG_RAYON_PROMOTIONS, slugifier };
