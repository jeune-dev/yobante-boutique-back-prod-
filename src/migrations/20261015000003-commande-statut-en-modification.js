'use strict';

/**
 * Statut de commande « en_modification » : interne à l'administration, placé
 * avant la validation. Le client et le vendeur voient « en_attente ».
 *
 * Idempotente (IF NOT EXISTS). L'ajout d'une valeur d'ENUM ne peut pas être
 * annulé simplement sous PostgreSQL : `down` ne fait rien.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_commandes_statut" ADD VALUE IF NOT EXISTS 'en_modification' BEFORE 'validee'`
    );
  },

  async down() {},
};
