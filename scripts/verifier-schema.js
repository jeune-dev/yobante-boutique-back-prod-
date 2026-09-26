'use strict';

// ─────────────────────────────────────────────────────────────
// scripts/verifier-schema.js — Diagnostic modèles ↔ base (lecture seule)
//
//   npm run schema:verifier
//
// Liste les tables, colonnes et valeurs d'ENUM déclarées dans les modèles
// mais absentes de la base configurée (.env). Code de sortie 1 s'il y a un
// écart : chaque écart est une source de 500 (« column … does not exist »).
// Correction : `npm run migrate` (migration 20260926000001-reconciliation-schema).
// ─────────────────────────────────────────────────────────────
const { sequelize } = require('../src/models');
const { analyserSchema } = require('../src/utils/schemaReconciliation');

/* eslint-disable no-console -- outil en ligne de commande */
(async () => {
  const ecarts = await analyserSchema(sequelize);
  const total =
    ecarts.tablesManquantes.length +
    ecarts.colonnesManquantes.length +
    ecarts.valeursEnumManquantes.length;

  if (total === 0) {
    console.log('✅ Schéma conforme aux modèles.');
  } else {
    console.log(`❌ ${total} écart(s) entre les modèles et la base :`);
    for (const t of ecarts.tablesManquantes) console.log(`  - table manquante : ${t}`);
    for (const c of ecarts.colonnesManquantes)
      console.log(`  - colonne manquante : ${c.table}.${c.colonne}`);
    for (const e of ecarts.valeursEnumManquantes)
      console.log(`  - valeur ENUM manquante : ${e.table}.${e.colonne} = '${e.valeur}'`);
  }
  await sequelize.close();
  process.exit(total === 0 ? 0 : 1);
})().catch(async (err) => {
  console.error('Vérification impossible :', err.message);
  await sequelize.close().catch(() => {});
  process.exit(2);
});
