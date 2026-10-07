'use strict';

/**
 * Traçabilité des modifications et annulations de commande.
 *
 * Jusqu'ici une commande ne pouvait qu'être rejetée (`motifRejet`), et
 * uniquement depuis l'état « en_attente ». La boutique a besoin d'annuler à
 * tout moment et de savoir *pourquoi* : une commande annulée parce que le
 * vendeur a annoncé un stock qu'il n'avait pas ne doit pas se confondre avec
 * un client qui change d'avis. `responsabiliteAnnulation` +
 * `vendeurResponsableId` sont ce qui permet ensuite de calculer la fiabilité
 * d'un vendeur ; `historiqueModifications` conserve chaque retouche de panier.
 */
async function ajouterColonneSiAbsente(queryInterface, table, colonne, definition) {
  const description = await queryInterface.describeTable(table);
  if (!description[colonne]) await queryInterface.addColumn(table, colonne, definition);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await ajouterColonneSiAbsente(queryInterface, 'commandes', 'motifAnnulation', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await ajouterColonneSiAbsente(queryInterface, 'commandes', 'annulePar', {
      type: Sequelize.ENUM('client', 'admin', 'vendeur'),
      allowNull: true,
    });

    await ajouterColonneSiAbsente(queryInterface, 'commandes', 'responsabiliteAnnulation', {
      type: Sequelize.ENUM('vendeur', 'client', 'transport', 'autre'),
      allowNull: true,
    });

    // SET NULL plutôt que CASCADE : supprimer un vendeur ne doit pas effacer
    // l'historique des commandes qu'il a fait annuler.
    await ajouterColonneSiAbsente(queryInterface, 'commandes', 'vendeurResponsableId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await ajouterColonneSiAbsente(queryInterface, 'commandes', 'annuleeAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await ajouterColonneSiAbsente(queryInterface, 'commandes', 'modifieeAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await ajouterColonneSiAbsente(queryInterface, 'commandes', 'modifieePar', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await ajouterColonneSiAbsente(queryInterface, 'commandes', 'historiqueModifications', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
    });

    // Le tableau de bord filtre les annulations par responsabilité pour
    // classer les vendeurs : sans index, ce calcul scanne toute la table.
    const indexes = await queryInterface.showIndex('commandes');
    if (!indexes.some((i) => i.name === 'commandes_responsabilite_vendeur_idx')) {
      await queryInterface.addIndex(
        'commandes',
        ['responsabiliteAnnulation', 'vendeurResponsableId'],
        {
          name: 'commandes_responsabilite_vendeur_idx',
        }
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('commandes', 'commandes_responsabilite_vendeur_idx');
    for (const colonne of [
      'historiqueModifications',
      'modifieePar',
      'modifieeAt',
      'annuleeAt',
      'vendeurResponsableId',
      'responsabiliteAnnulation',
      'annulePar',
      'motifAnnulation',
    ]) {
      await queryInterface.removeColumn('commandes', colonne);
    }
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_commandes_annulePar";');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_commandes_responsabiliteAnnulation";'
    );
  },
};
