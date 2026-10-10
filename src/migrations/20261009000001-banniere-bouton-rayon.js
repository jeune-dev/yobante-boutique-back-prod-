'use strict';

/**
 * Bannières de l'accueil mobile : bouton « Découvrir » et rayon ciblé.
 *
 * - `afficherBouton` / `texteBouton` : l'application pose un bouton sur la
 *   bannière (maquette de l'accueil). L'administration peut le masquer ou en
 *   changer le libellé.
 * - `rayonId` : au toucher, l'application ouvre ce rayon quand la bannière ne
 *   porte pas de produits mis en avant.
 *
 * Idempotente : chaque colonne n'est ajoutée que si elle manque.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const colonnes = await queryInterface.describeTable('bannieres');

    if (!colonnes.afficherBouton) {
      await queryInterface.addColumn('bannieres', 'afficherBouton', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }
    if (!colonnes.texteBouton) {
      await queryInterface.addColumn('bannieres', 'texteBouton', {
        type: Sequelize.STRING(40),
        allowNull: true,
        defaultValue: 'Découvrir',
      });
    }
    if (!colonnes.rayonId) {
      await queryInterface.addColumn('bannieres', 'rayonId', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'rayons', key: 'id' },
        onUpdate: 'CASCADE',
        // Supprimer un rayon ne supprime pas la bannière : elle perd sa cible.
        onDelete: 'SET NULL',
      });
    }
  },

  async down(queryInterface) {
    const colonnes = await queryInterface.describeTable('bannieres');
    if (colonnes.rayonId) await queryInterface.removeColumn('bannieres', 'rayonId');
    if (colonnes.texteBouton) await queryInterface.removeColumn('bannieres', 'texteBouton');
    if (colonnes.afficherBouton) await queryInterface.removeColumn('bannieres', 'afficherBouton');
  },
};
