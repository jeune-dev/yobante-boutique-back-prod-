const crypto = require('crypto');

// Alphabets sans caractères ambigus (0/O, 1/l/I) : le mot de passe est recopié
// à la main depuis un email, la confusion coûte un ticket de support.
const MAJUSCULES = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MINUSCULES = 'abcdefghjkmnpqrstuvwxyz';
const CHIFFRES = '23456789';

/** Tirage uniforme non biaisé dans `alphabet` (crypto, pas Math.random). */
const tirer = (alphabet) => alphabet[crypto.randomInt(alphabet.length)];

/**
 * Mot de passe temporaire : au moins une majuscule et un chiffre, pour
 * satisfaire les règles de complexité exigées lors du changement.
 */
const genererMotDePasse = (longueur = 12) => {
  const tous = MAJUSCULES + MINUSCULES + CHIFFRES;
  const caracteres = [tirer(MAJUSCULES), tirer(CHIFFRES), tirer(MINUSCULES)];
  for (let i = caracteres.length; i < longueur; i++) caracteres.push(tirer(tous));

  // Mélange de Fisher-Yates : `sort(() => Math.random() - 0.5)` ne produit pas
  // une permutation uniforme et laisserait la majuscule souvent en tête.
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join('');
};

module.exports = { genererMotDePasse };
