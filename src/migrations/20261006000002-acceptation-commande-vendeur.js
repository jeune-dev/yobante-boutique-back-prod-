'use strict';

/**
 * Acceptation ou refus d'une commande par un vendeur marketplace.
 *
 * La décision ne peut pas être un champ de `commandes` : une commande peut
 * contenir les produits de plusieurs vendeurs, qui décident chacun pour leur
 * part. La table porte donc le couple (commande, vendeur).
 *
 * Aucune ligne n'est créée au passage de la commande : l'absence de ligne
 * **est** l'état « en attente ». Le dénominateur du taux d'acceptation se
 * déduit des lignes de commande contenant un produit du vendeur, ce qui
 * évite de toucher au parcours de commande du client — le chemin le plus
 * sensible de l'application — pour une information qu'on sait déjà calculer.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const noms = tables.map((t) => (typeof t === 'string' ? t : t.tableName));
    if (noms.includes('acceptations_commande')) return;

    await queryInterface.createTable('acceptations_commande', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      commandeId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'commandes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      vendeurId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      statut: {
        type: Sequelize.ENUM('acceptee', 'refusee'),
        allowNull: false,
      },
      // Obligatoire sur un refus : sans motif, impossible de distinguer une
      // rupture de stock d'un désengagement, ni d'en tirer un suivi.
      motifRefus: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      decideLe: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
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

    // Un vendeur ne décide qu'une fois par commande : la contrainte empêche
    // qu'un double envoi crée deux décisions contradictoires.
    await queryInterface.addIndex('acceptations_commande', ['commandeId', 'vendeurId'], {
      name: 'acceptations_commande_unique_idx',
      unique: true,
    });
    await queryInterface.addIndex('acceptations_commande', ['vendeurId', 'statut'], {
      name: 'acceptations_vendeur_statut_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('acceptations_commande');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_acceptations_commande_statut";'
    );
  },
};
