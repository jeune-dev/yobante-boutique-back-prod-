'use strict';

// ─────────────────────────────────────────────────────────────
// scripts/seed-legacy-migrations.js
//
// Avant août 2026, le schéma était géré par sequelize.sync() au démarrage
// (voir server.js) — jamais par `sequelize-cli db:migrate`. La table
// SequelizeMeta n'a donc jamais été alimentée, alors que le schéma qu'elle
// est censée décrire existe déjà en prod.
//
// Sans ce script, `db:migrate` tente de rejouer ces migrations historiques
// depuis zéro et échoue sur la première colonne déjà existante.
//
// Idempotent (INSERT ... ON CONFLICT DO NOTHING) : sans danger à relancer.
// Ne touche QUE les migrations antérieures au 22/08/2026 (passage définitif
// à sequelize-cli) — toute migration plus récente doit s'exécuter normalement.
// ─────────────────────────────────────────────────────────────
const sequelize = require('../src/config/db');
const logger = require('../src/utils/logger');

const MIGRATIONS_DEJA_APPLIQUEES = [
  '20260718000001-initial-indexes.js',
  '20260718000002-produit-demande-publication.js',
  '20260718000003-paiement-fournisseur.js',
  '20260718000004-notifications.js',
  '20260719000001-rayon-sousrayon-banniere.js',
  '20260719000002-blocs-promo-sous-sections.js',
  '20260719000003-promotion-bloc-promo.js',
  '20260727_mark_motif_rejet_done.js',
  '20260728_add_paiement_columns.js',
];

async function main() {
  // `sequelize-cli` crée normalement cette table lui-même au premier
  // `db:migrate` — on la crée ici au cas où ce script tournerait avant elle.
  await sequelize.query(
    'CREATE TABLE IF NOT EXISTS "SequelizeMeta" (name VARCHAR(255) NOT NULL UNIQUE PRIMARY KEY)'
  );

  for (const name of MIGRATIONS_DEJA_APPLIQUEES) {
    await sequelize.query(
      'INSERT INTO "SequelizeMeta" (name) VALUES (:name) ON CONFLICT (name) DO NOTHING',
      { replacements: { name } }
    );
  }

  logger.info(`Migrations historiques marquées comme appliquées (${MIGRATIONS_DEJA_APPLIQUEES.length})`);
  await sequelize.close();
}

main().catch((err) => {
  logger.error('[seed-legacy-migrations] Échec', { error: err.message });
  process.exit(1);
});
