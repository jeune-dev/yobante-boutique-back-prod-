'use strict';

/**
 * Aligne la base sur les modèles : ajoute toute colonne ou valeur d'ENUM
 * déclarée dans un modèle mais absente en base.
 *
 * Cause des 500 en série sur le dashboard (promotions, produits à valider,
 * commandes, modification vendeur…) : des colonnes ajoutées aux modèles après
 * la création de leur table n'ont jamais été créées en production —
 * `sequelize.sync()` ne crée que les tables manquantes, et les migrations
 * historiques ont été marquées appliquées sans être jouées
 * (scripts/seed-legacy-migrations.js). Toute requête qui les sélectionne
 * échoue sur « column … does not exist ».
 *
 * Idempotente et uniquement additive (voir utils/schemaReconciliation.js).
 * Diagnostic sans modification : `npm run schema:verifier`.
 */
module.exports = {
  async up() {
    const { sequelize } = require('../models');
    const { reconcilierSchema } = require('../utils/schemaReconciliation');
    try {
      // eslint-disable-next-line no-console -- sortie de sequelize-cli
      const ajoutes = await reconcilierSchema(sequelize, { log: (m) => console.log(`  ${m}`) });
      // eslint-disable-next-line no-console
      console.log(
        `  Réconciliation : ${ajoutes.tables.length} table(s), ${ajoutes.colonnes.length} colonne(s), ${ajoutes.valeursEnum.length} valeur(s) d'ENUM ajoutée(s)`
      );
    } finally {
      await sequelize.close();
    }
  },

  // Rien à défaire de façon sûre : les colonnes ajoutées sont celles que le
  // code attend ; les retirer recréerait les 500.
  async down() {},
};
