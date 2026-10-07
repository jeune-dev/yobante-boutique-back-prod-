'use strict';

/**
 * Retours produits — table inexistante jusqu'ici.
 *
 * Un retour porte sur une **ligne** de commande (`commandeItemId`), pas sur la
 * commande entière : un client peut ne renvoyer qu'un article sur cinq, et le
 * taux de retour par produit n'a de sens qu'à cette maille.
 *
 * `produitId` est dupliqué depuis la ligne de commande volontairement : les
 * statistiques par produit et le taux de retour se calculent sans jointure
 * supplémentaire, et le retour survit à la purge d'une commande.
 *
 * `responsabilite` / `vendeurResponsableId` suivent la même logique que
 * l'annulation de commande : ils alimentent le score de fiabilité vendeur.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.map((t) => (typeof t === 'string' ? t : t.tableName)).includes('retours')) return;

    await queryInterface.createTable('retours', {
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
      commandeItemId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'commande_items', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      produitId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'produits', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      quantite: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      motif: {
        type: Sequelize.ENUM(
          'produit_abime',
          'non_conforme',
          'erreur_article',
          'stock_inexistant',
          'retard_livraison',
          'changement_avis',
          'autre'
        ),
        allowNull: false,
      },
      motifDetail: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      statut: {
        type: Sequelize.ENUM('demande', 'accepte', 'refuse', 'rembourse'),
        allowNull: false,
        defaultValue: 'demande',
      },
      responsabilite: {
        type: Sequelize.ENUM('vendeur', 'client', 'transport', 'autre'),
        allowNull: true,
      },
      vendeurResponsableId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      montantRembourse: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      // Un produit abîmé ne retourne pas en stock ; un produit non conforme si.
      remisEnStock: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      traitePar: {
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

    await queryInterface.addIndex('retours', ['commandeId'], { name: 'retours_commande_idx' });
    await queryInterface.addIndex('retours', ['produitId'], { name: 'retours_produit_idx' });
    await queryInterface.addIndex('retours', ['statut'], { name: 'retours_statut_idx' });
    await queryInterface.addIndex('retours', ['motif'], { name: 'retours_motif_idx' });
    await queryInterface.addIndex('retours', ['createdAt'], { name: 'retours_created_idx' });
    await queryInterface.addIndex('retours', ['responsabilite', 'vendeurResponsableId'], {
      name: 'retours_responsabilite_vendeur_idx',
    });
    // Un même article de commande ne peut pas faire l'objet de deux retours
    // ouverts : la contrainte évite les doublons de saisie côté dashboard.
    await queryInterface.addIndex('retours', ['commandeItemId'], {
      name: 'retours_commande_item_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('retours');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_retours_motif";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_retours_statut";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_retours_responsabilite";');
  },
};
