'use strict';

/**
 * État du produit (neuf / reconditionné) rendu facultatif, puis renseigné
 * d'après la mention portée par chaque produit.
 *
 * Jusqu'ici, un produit pour lequel l'administration ne précisait pas l'état
 * était enregistré « neuf » : impossible de distinguer un téléphone neuf d'un
 * kilo de viande, et l'application ne pouvait pas afficher de badge « Neuf »
 * sans le coller sur tout le catalogue.
 *
 * Désormais : NULL = état non précisé (pas de badge), 'neuf' ou
 * 'reconditionne' = badge affiché dans l'application.
 *
 * Reprise des produits existants, d'après leur nom et leur description :
 *  1. « neuf » posé par défaut → NULL (non précisé) ;
 *  2. mention « neuf / neuve » → 'neuf' ;
 *  3. mention « reconditionné(e) » → 'reconditionne' (l'emporte sur « neuf » :
 *     « reconditionné, comme neuf » est un produit reconditionné).
 * Les produits déjà marqués « reconditionne » le restent.
 *
 * Idempotente : peut être rejouée sans effet de bord.
 */

// Mots entiers, insensibles à la casse et aux accents (PostgreSQL ~*).
const MENTION_NEUF = "'\\m(neuf|neufs|neuve|neuves)\\M'";
const MENTION_RECONDITIONNE = "'\\mr[eéÉ]conditionn'";

const mentionne = (motif) => `(nom ~* ${motif} OR coalesce(description, '') ~* ${motif})`;

module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);

    await q('ALTER TABLE produits ALTER COLUMN etat DROP DEFAULT');
    await q('ALTER TABLE produits ALTER COLUMN etat DROP NOT NULL');

    // 1. « neuf » sans mention : c'était la valeur par défaut, pas un choix.
    await q(
      `UPDATE produits SET etat = NULL
        WHERE etat = 'neuf' AND NOT ${mentionne(MENTION_NEUF)}`
    );
    // 2. Mention « neuf » → badge Neuf.
    await q(
      `UPDATE produits SET etat = 'neuf'
        WHERE etat IS NULL AND ${mentionne(MENTION_NEUF)}`
    );
    // 3. Mention « reconditionné » → badge Reconditionné.
    await q(
      `UPDATE produits SET etat = 'reconditionne'
        WHERE ${mentionne(MENTION_RECONDITIONNE)}
          AND etat IS DISTINCT FROM 'reconditionne'`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("UPDATE produits SET etat = 'neuf' WHERE etat IS NULL");
    await queryInterface.sequelize.query(
      "ALTER TABLE produits ALTER COLUMN etat SET DEFAULT 'neuf'"
    );
  },
};
