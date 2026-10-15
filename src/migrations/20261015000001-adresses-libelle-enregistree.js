'use strict';

/**
 * Carnet d'adresses de livraison :
 *  - `libelle` : nom donné par le client (« Chez papa »), facultatif ;
 *  - `estEnregistree` : faux pour une adresse d'une seule commande, ou pour
 *    l'ancienne version d'une adresse modifiée (gardée pour l'historique des
 *    commandes). Ces adresses n'apparaissent plus dans le carnet.
 *
 * Reprise des adresses existantes :
 *  - un client ne garde qu'un domicile (adresse par défaut) : les doublons
 *    créés par les modifications successives du profil sont retirés du
 *    carnet, sauf le plus récent ;
 *  - les autres adresses avaient toutes été ajoutées automatiquement
 *    (anciens domiciles du profil, adresses « Autre part » d'une commande),
 *    sans que le client ait choisi de les garder : elles sont retirées du
 *    carnet. Elles restent en base pour l'historique des commandes.
 *
 * À exécuter une seule fois (suivi par sequelize-cli) : la reprise masque les
 * adresses sans nom qui ne sont pas un domicile.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const colonnes = await queryInterface.describeTable('adresses');
    if (!colonnes.libelle) {
      await queryInterface.addColumn('adresses', 'libelle', {
        type: Sequelize.STRING(60),
        allowNull: true,
      });
    }
    // La colonne a pu être ajoutée par l'alignement du schéma au démarrage du
    // serveur : la reprise ci-dessous s'applique quand même (une seule fois,
    // sequelize-cli enregistre la migration comme exécutée).
    if (!colonnes.estEnregistree) {
      await queryInterface.addColumn('adresses', 'estEnregistree', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }

    // Un seul domicile par client : le plus récent.
    await queryInterface.sequelize.query(`
      UPDATE adresses a SET "isDefault" = false, "estEnregistree" = false
       WHERE a."isDefault" = true
         AND EXISTS (
           SELECT 1 FROM adresses b
            WHERE b."userId" = a."userId" AND b."isDefault" = true
              AND b."createdAt" > a."createdAt"
         )
    `);

    // Adresses ajoutées sans l'accord du client : hors du carnet.
    await queryInterface.sequelize.query(`
      UPDATE adresses SET "estEnregistree" = false
       WHERE "isDefault" = false AND "estEnregistree" = true AND libelle IS NULL
    `);
  },

  async down(queryInterface) {
    const colonnes = await queryInterface.describeTable('adresses');
    if (colonnes.libelle) await queryInterface.removeColumn('adresses', 'libelle');
    if (colonnes.estEnregistree) await queryInterface.removeColumn('adresses', 'estEnregistree');
  },
};
