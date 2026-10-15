// ─────────────────────────────────────────────────────────────
// utils/rechercheTexte.js
// Recherche de produits tolérante : casse, accents, variantes et fautes.
// ─────────────────────────────────────────────────────────────
//
// Règles (identiques côté application mobile, lib/core/utils/recherche_texte.dart) :
//  - la requête est découpée en mots ; les petits mots (« de », « la »…) sont
//    ignorés ; casse et accents ne comptent pas (« television » = « Télévision ») ;
//  - CHAQUE mot doit se retrouver dans le produit (ET) — nom, catégorie,
//    rayon, sous-rayon ou description — avec de la tolérance :
//      · début de mot (« chau » → « Chaussure ») à partir de 4 lettres,
//      · même racine (« television » → « Téléviseur »),
//      · faute de frappe (« televsion », « ordinatuer » → 1 faute admise dès
//        4 lettres, 2 dès 8 lettres),
//      · pluriel en s/x ;
//  - un mot de moins de 4 lettres doit être exact (« sac » ne trouve pas
//    « Sachet », « lit » ne trouve pas « Litre »).
//
// La base fait un premier tri large (début de mot sur les 3 premières lettres,
// sans accent) ; la tolérance est appliquée ensuite en JavaScript, puis les
// résultats sont classés par pertinence et paginés.

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

/** Nombre maximal de produits examinés par recherche (premier tri en base). */
const MAX_CANDIDATS = 1000;

const sansAccents = (texte) =>
  String(texte || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');

/** Mots d'un texte, en minuscules et sans accents. */
const decouper = (texte) =>
  sansAccents(texte)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Mots utiles d'une requête (6 au plus). */
function motsRecherche(requete) {
  const mots = decouper(requete);
  const utiles = mots.filter((m) => !MOTS_VIDES.has(m));
  // Requête faite uniquement de petits mots : on les garde plutôt que rien.
  return [...new Set(utiles.length ? utiles : mots)].slice(0, 6);
}

/** Mot sans sa marque de pluriel : « chaussures » → « chaussure ». */
const racine = (mot) => (mot.length > 3 ? mot.replace(/[sx]$/, '') : mot);

/** Motif PostgreSQL d'un mot : chaque voyelle accepte ses accents. */
const motif = (mot) =>
  mot
    .split('')
    .map((c) => ACCENTS[c] || c)
    .join('');

/** Fautes de frappe admises pour un mot de cette longueur. */
const fautesAdmises = (longueur) => (longueur >= 8 ? 2 : longueur >= 4 ? 1 : 0);

/**
 * Distance d'édition (insertion, suppression, substitution, inversion de deux
 * lettres voisines), arrêtée dès qu'elle dépasse [max].
 */
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length;
  const m = b.length;
  let avantAvant = null;
  let avant = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i += 1) {
    const ligne = [i];
    let minLigne = i;
    for (let j = 1; j <= m; j += 1) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(avant[j] + 1, ligne[j - 1] + 1, avant[j - 1] + cout);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, avantAvant[j - 2] + 1);
      }
      ligne.push(v);
      if (v < minLigne) minLigne = v;
    }
    if (minLigne > max) return max + 1;
    avantAvant = avant;
    avant = ligne;
  }
  return avant[m];
}

const prefixeCommun = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
};

/**
 * Qualité de la correspondance entre un mot cherché et un mot du produit :
 * 3 = exact, 2 = début de mot / même racine, 1 = faute de frappe, 0 = aucune.
 * [souple] = false (description) : mot entier ou faute seulement.
 */
function correspondanceMot(terme, mot, souple = true) {
  const r = racine(terme);
  const w = racine(mot);
  if (w === r) return 3;
  if (r.length < 4) return 0; // mot court : exact uniquement
  if (souple) {
    if (mot.startsWith(r)) return 2;
    const cp = prefixeCommun(r, w);
    if (cp >= 5 && cp >= 0.7 * Math.min(r.length, w.length)) return 2;
  }
  const max = fautesAdmises(r.length);
  if (distance(r, w, max) <= max) return 1;
  // Frappe en cours, avec une faute : « televs » → « television ».
  if (souple && w.length > r.length && distance(r, w.slice(0, r.length), max) <= max) return 1;
  return 0;
}

/** Textes d'un produit (instance Sequelize ou objet) utiles à la recherche. */
function textesProduit(p) {
  const v = typeof p.get === 'function' ? p.get({ plain: true }) : p;
  return {
    noms: [v.nom, v.categorie?.nom, v.rayon?.nom, v.sousRayon?.nom]
      .filter(Boolean)
      .flatMap(decouper),
    description: decouper(v.description),
  };
}

/**
 * Pertinence d'un produit pour la requête (0 = ne correspond pas).
 * Chaque mot cherché doit être trouvé ; un mot trouvé dans le nom pèse plus
 * qu'un mot trouvé dans la description.
 */
function pertinence(produit, requete) {
  const termes = motsRecherche(requete);
  if (!termes.length) return 0;
  const { noms, description } = textesProduit(produit);
  let total = 0;
  for (const t of termes) {
    let meilleur = 0;
    for (const m of noms) meilleur = Math.max(meilleur, correspondanceMot(t, m) * 10);
    if (meilleur < 30) {
      for (const m of description) meilleur = Math.max(meilleur, correspondanceMot(t, m, false));
    }
    if (!meilleur) return 0;
    total += meilleur;
  }
  return total;
}

const correspond = (produit, requete) => pertinence(produit, requete) > 0;

/** Motif « large » d'un mot pour le premier tri en base. */
const motifLarge = (mot) => {
  const r = racine(mot);
  // Mot court : exact (pluriel accepté). Sinon début de mot sur 3 lettres,
  // ce qui laisse passer variantes et fautes, départagées ensuite en JS.
  return r.length < 4 ? `\\m${motif(r)}(s|x)?\\M` : `\\m${motif(r.slice(0, 3))}`;
};

/** Condition qui ne correspond à aucun produit. */
const AUCUN = Object.freeze({ id: { [Op.is]: null } });

/**
 * Premier tri en base (where Sequelize), volontairement large.
 * @returns {Promise<object|null>} null si la requête est vide.
 */
async function conditionRecherche(requete, { Categorie } = {}) {
  if (!String(requete || '').trim()) return null;
  const mots = motsRecherche(requete);
  if (!mots.length) return AUCUN;

  const conditions = [];
  for (const mot of mots) {
    const p = motifLarge(mot);
    const ou = [{ nom: { [Op.iRegexp]: p } }, { description: { [Op.iRegexp]: p } }];
    if (Categorie) {
      const categories = await Categorie.findAll({
        attributes: ['id'],
        where: { nom: { [Op.iRegexp]: p } },
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

/**
 * Recherche complète : premier tri en base, tolérance, classement, pagination.
 *
 * @param {object} Produit — modèle
 * @param {object} options — { requete, where, include, order, page, limit, Categorie }
 * @returns {Promise<{ count: number, rows: object[] }>}
 */
async function chercherProduits(
  Produit,
  {
    requete,
    where = {},
    include,
    order,
    page = 1,
    limit = 20,
    Categorie,
    attributes,
    classer = true,
  }
) {
  const offset = (page - 1) * limit;
  const condition = await conditionRecherche(requete, { Categorie });
  if (!condition) {
    return Produit.findAndCountAll({ where, include, order, limit, offset, attributes });
  }

  const candidats = await Produit.findAll({
    where: { ...where, ...condition },
    include,
    order,
    attributes,
    limit: MAX_CANDIDATS,
  });

  const retenus = candidats
    .map((p, rang) => ({ p, rang, score: pertinence(p, requete) }))
    .filter((x) => x.score > 0)
    // Plus pertinent d'abord ; à égalité, l'ordre demandé (récents, prix…).
    // Tri explicite du client (prix croissant…) : son ordre est conservé.
    .sort((a, b) => (classer ? b.score - a.score : 0) || a.rang - b.rang)
    .map((x) => x.p);

  return { count: retenus.length, rows: retenus.slice(offset, offset + limit) };
}

module.exports = {
  chercherProduits,
  conditionRecherche,
  pertinence,
  correspond,
  correspondanceMot,
  distance,
  motsRecherche,
  sansAccents,
  motif,
  racine,
};
