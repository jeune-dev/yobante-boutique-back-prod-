'use strict';

/**
 * État du produit (neuf / reconditionné) rendu facultatif.
 *
 * Jusqu'ici, un produit pour lequel l'administration ne précisait pas l'état
 * était enregistré « neuf » : impossible de distinguer un téléphone neuf d'un
 * kilo de viande, et l'application ne pouvait pas afficher de badge « Neuf »
 * sans le coller sur tout le catalogue.
 *
 * Désormais : NULL = état non précisé (pas de badge), 'neuf' ou
 * 'reconditionne' = badge affiché.
 *
 * Les produits existants marqués « neuf » passent à NULL : l'écran de
 * modification de l'administration les affichait déjà comme « état non
 * précisé » (la case n'était cochée que pour « reconditionné »). Il suffit de
 * cocher « Neuf » sur un produit pour que le badge apparaisse.
 *
 * Idempotente.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE produits ALTER COLUMN etat DROP DEFAULT');
    await queryInterface.sequelize.query('ALTER TABLE produits ALTER COLUMN etat DROP NOT NULL');
    await queryInterface.sequelize.query("UPDATE produits SET etat = NULL WHERE etat = 'neuf'");
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("UPDATE produits SET etat = 'neuf' WHERE etat IS NULL");
    await queryInterface.sequelize.query(
      "ALTER TABLE produits ALTER COLUMN etat SET DEFAULT 'neuf'"
    );
  },
};
