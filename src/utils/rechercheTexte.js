// ─────────────────────────────────────────────────────────────
// utils/rechercheTexte.js
// Recherche de produits par mots, insensible à la casse et aux accents.
// ─────────────────────────────────────────────────────────────
//
// Règles (identiques côté application mobile) :
//  - la requête est découpée en mots ; les petits mots (« de », « la »…) sont
//    ignorés ;
//  - CHAQUE mot doit être trouvé (ET) :
//      · dans un mot du nom du produit ou de sa catégorie : mot entier, ou
//        début de mot à partir de 4 lettres (« chau » trouve « Chaussure »,
//        mais « sac » ne trouve pas « Sachet »),
//      · ou comme mot entier de la description (pluriel en s/x accepté) ;
//  - « telephone » trouve « Téléphone » et inversement.
//
// Avant, la requête était cherchée telle quelle n'importe où dans le nom ou la
// description : « sac » remontait « sachet », une recherche de deux mots ne
// trouvait rien, et `%` ou `_` renvoyaient tout le catalogue.

const { Op } = require('sequelize');

const MOTS_VIDES = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'l',
  'd',
  'un',
  'une',
  'et',
  'ou',
  'en',
  'pour',
  'a',
  'au',
  'aux',
  'avec',
  'sur',
  'par',
  'the',
  'and',
]);

const ACCENTS = {
  a: '[aàáâäã]',
  e: '[eéèêë]',
  i: '[iìíîï]',
  o: '[oòóôöõ]',
  u: '[uùúûü]',
  c: '[cç]',
  n: '[nñ]',
  y: '[yÿ]',
};

const sansAccents = (texte) =>
  String(texte || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Mots utiles d'une requête, en minuscules et sans accents (6 au plus). */
function motsRecherche(requete) {
  const mots = sansAccents(requete)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const utiles = mots.filter((m) => !MOTS_VIDES.has(m));
  // Requête faite uniquement de petits mots : on les garde plutôt que rien.
  return [...new Set(utiles.length ? utiles : mots)].slice(0, 6);
}

/** Mot sans sa marque de pluriel : « chaussures » cherche « chaussure(s) ». */
const racine = (mot) => (mot.length > 3 ? mot.replace(/[sx]$/, '') : mot);

/**
 * Motif d'expression régulière PostgreSQL pour un mot : chaque voyelle
 * accepte ses variantes accentuées. Le mot ne contient que [a-z0-9]
 * (voir motsRecherche) : aucun caractère spécial à échapper.
 */
const motif = (mot) =>
  mot
    .split('')
    .map((c) => ACCENTS[c] || c)
    .join('');

/**
 * Motif « mot du nom » : début de mot à partir de 4 lettres (recherche en
 * cours de frappe), mot entier en dessous (pluriel s/x accepté).
 */
const motifNom = (mot) => {
  const r = racine(mot);
  const p = motif(r);
  return r.length >= 4 ? `\\m${p}` : `\\m${p}(s|x)?\\M`;
};

/** Condition qui ne correspond à aucun produit. */
const AUCUN = Object.freeze({ id: { [Op.is]: null } });

/**
 * Condition Sequelize (where) pour une recherche de produits.
 *
 * @param {string} requete
 * @param {object} [options]
 * @param {import('sequelize').ModelStatic} [options.Categorie] — si fourni,
 *        un mot peut aussi correspondre au nom de la catégorie du produit.
 * @param {boolean} [options.description=true] — chercher aussi dans la description.
 * @returns {Promise<object|null>} null si la requête est vide.
 */
async function conditionRecherche(requete, { Categorie, description = true } = {}) {
  if (!String(requete || '').trim()) return null;
  const mots = motsRecherche(requete);
  // Requête faite seulement de symboles (« %% », « ?? ») : aucun résultat.
  if (!mots.length) return AUCUN;

  const conditions = [];
  for (const mot of mots) {
    const p = motif(racine(mot));
    const pNom = motifNom(mot);
    const ou = [{ nom: { [Op.iRegexp]: pNom } }];
    if (description) {
      ou.push({ description: { [Op.iRegexp]: `\\m${p}(s|x)?\\M` } });
    }
    if (Categorie) {
      const categories = await Categorie.findAll({
        attributes: ['id'],
        where: { nom: { [Op.iRegexp]: pNom } },
        raw: true,
      });
      if (categories.length) {
        ou.push({ categorieId: { [Op.in]: categories.map((c) => c.id) } });
      }
    }
    conditions.push({ [Op.or]: ou });
  }
  return { [Op.and]: conditions };
}

module.exports = { conditionRecherche, motsRecherche, sansAccents, motif, racine, motifNom };
