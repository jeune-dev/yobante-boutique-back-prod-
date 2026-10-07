'use strict';

/**
 * Finance marketplace : taux de commission et reversements aux vendeurs.
 *
 * Rien ne permettait jusqu'ici de distinguer ce qui revient à la plateforme
 * de ce qui est dû au vendeur : le dashboard ne pouvait afficher ni
 * commission, ni montant à reverser, ni revenu propre.
 *
 * Deux apports :
 *  - `profils_vendeurs.tauxCommission` : le taux négocié avec un vendeur.
 *    Nul = on applique le taux par défaut de la plateforme, ce qui évite
 *    d'avoir à renseigner chaque profil pour démarrer.
 *  - table `reversements` : chaque versement effectué à un vendeur, avec sa
 *    période de référence. Le montant encore dû se déduit du chiffre
 *    d'affaires livré moins la commission moins ce qui a déjà été reversé —
 *    aucun solde n'est stocké, donc aucun solde ne peut se désynchroniser.
 */
async function ajouterColonneSiAbsente(queryInterface, table, colonne, definition) {
  const description = await queryInterface.describeTable(table);
  if (!description[colonne]) await queryInterface.addColumn(table, colonne, definition);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await ajouterColonneSiAbsente(queryInterface, 'profils_vendeurs', 'tauxCommission', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Pourcentage prélevé par la plateforme ; nul = taux par défaut',
    });

    const tables = await queryInterface.showAllTables();
    const noms = tables.map((t) => (typeof t === 'string' ? t : t.tableName));
    if (noms.includes('reversements')) return;

    await queryInterface.createTable('reversements', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      vendeurId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      reference: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      montant: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      statut: {
        type: Sequelize.ENUM('en_attente', 'paye', 'annule'),
        allowNull: false,
        defaultValue: 'en_attente',
      },
      methode: {
        type: Sequelize.ENUM('wave', 'orange_money', 'virement', 'especes', 'autre'),
        allowNull: true,
      },
      // Période couverte par le versement : sans elle, impossible de dire ce
      // qu'un reversement solde exactement.
      periodeDebut: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      periodeFin: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      payeLe: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      note: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      creePar: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('reversements', ['vendeurId'], {
      name: 'reversements_vendeur_idx',
    });
    await queryInterface.addIndex('reversements', ['statut'], {
      name: 'reversements_statut_idx',
    });
    await queryInterface.addIndex('reversements', ['createdAt'], {
      name: 'reversements_created_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('reversements');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_reversements_statut";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_reversements_methode";');
    await queryInterface.removeColumn('profils_vendeurs', 'tauxCommission');
  },
};
