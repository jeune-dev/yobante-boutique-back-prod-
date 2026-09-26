'use strict';

// ─────────────────────────────────────────────────────────────
// scripts/synchroniser-contrat-mobile.js
//
// Les fixtures du contrat mobile (tests/contract/fixtures) sont produites par
// tests/contract/mobile.contract.test.js et rejouées par l'application Flutter
// (test/contract/fixtures). Elles sont déterministes : toute différence entre
// les deux copies est une évolution du contrat que le mobile n'a pas encore
// intégrée.
//
//   npm run contrat:mobile              copie les fixtures vers le mobile
//   npm run contrat:mobile -- --verifier  signale l'écart (code 1), sans copier
//
// Dépôt mobile : variable CONTRAT_MOBILE_DIR, sinon le dossier voisin
// ../Yobnate-boutique-mobile-prod.
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

/* eslint-disable no-console -- outil en ligne de commande */
const source = path.join(__dirname, '..', 'tests', 'contract', 'fixtures');
const depotMobile =
  process.env.CONTRAT_MOBILE_DIR || path.join(__dirname, '..', '..', 'Yobnate-boutique-mobile-prod');
const cible = path.join(depotMobile, 'test', 'contract', 'fixtures');
const verifierSeulement = process.argv.includes('--verifier');

if (!fs.existsSync(depotMobile)) {
  console.error(`Dépôt mobile introuvable : ${depotMobile} (définir CONTRAT_MOBILE_DIR).`);
  process.exit(2);
}

const lister = (dossier) =>
  fs.existsSync(dossier) ? fs.readdirSync(dossier).filter((f) => f.endsWith('.json')) : [];
const lire = (fichier) => JSON.stringify(JSON.parse(fs.readFileSync(fichier, 'utf8')));

const backend = new Set(lister(source));
const mobile = new Set(lister(cible));
const ajouts = [...backend].filter((f) => !mobile.has(f));
const retraits = [...mobile].filter((f) => !backend.has(f));
const modifies = [...backend].filter(
  (f) => mobile.has(f) && lire(path.join(source, f)) !== lire(path.join(cible, f))
);
const total = ajouts.length + retraits.length + modifies.length;

if (verifierSeulement) {
  if (total === 0) {
    console.log(`✅ Contrat mobile à jour (${backend.size} fixtures).`);
    process.exit(0);
  }
  console.log(`❌ Contrat mobile désynchronisé (${total} écart(s)) :`);
  for (const f of ajouts) console.log(`  + ${f} (absente du mobile)`);
  for (const f of retraits) console.log(`  - ${f} (n'existe plus côté backend)`);
  for (const f of modifies) console.log(`  ~ ${f}`);
  console.log('Corriger : npm run contrat:mobile');
  process.exit(1);
}

fs.mkdirSync(cible, { recursive: true });
for (const f of [...ajouts, ...modifies]) fs.copyFileSync(path.join(source, f), path.join(cible, f));
for (const f of retraits) fs.unlinkSync(path.join(cible, f));
console.log(
  `Contrat mobile synchronisé : ${ajouts.length} ajoutée(s), ${modifies.length} mise(s) à jour, ${retraits.length} retirée(s).`
);
