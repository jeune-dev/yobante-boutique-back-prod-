'use strict';

const crypto = require('crypto');

/**
 * Remplacement du catalogue de rayons (octobre 2026).
 *
 * Les rayons et sous-rayons existants sont supprimés puis remplacés par la
 * liste de src/seeders/rayons.data.js, dans son ordre.
 *
 * Les produits ne sont PAS supprimés : ils perdent seulement leur rayon et
 * sous-rayon (l'ancien classement n'a pas d'équivalent sûr dans le nouveau).
 * Ils restent en ligne et se reclassent depuis le dashboard (Produits →
 * Modifier). Les bannières qui ouvraient un rayon perdent cette cible.
 *
 * Une migration ne s'exécute qu'une fois (table SequelizeMeta) : les rayons
 * créés ou modifiés ensuite depuis le dashboard ne seront pas touchés.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Liste figée au moment de la migration, partagée avec les seeders.
    // eslint-disable-next-line global-require
    const { RAYONS, slugifier } = require('../seeders/rayons.data');
    const maintenant = new Date();

    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      const [[{ total }]] = await q(
        'SELECT COUNT(*)::int AS total FROM produits WHERE "rayonId" IS NOT NULL OR "sousRayonId" IS NOT NULL'
      );
      // eslint-disable-next-line no-console
      console.log(`[catalogue-rayons] ${total} produit(s) détaché(s) de leur ancien rayon`);

      await q('UPDATE produits SET "rayonId" = NULL, "sousRayonId" = NULL');
      const bannieres = await queryInterface.describeTable('bannieres');
      if (bannieres.rayonId) await q('UPDATE bannieres SET "rayonId" = NULL');
      await q('DELETE FROM sous_rayons');
      await q('DELETE FROM rayons');

      const rayons = [];
      const sousRayons = [];
      RAYONS.forEach((def, i) => {
        const id = crypto.randomUUID();
        const slug = slugifier(def.nom);
        rayons.push({
          id,
          nom: def.nom,
          slug,
          description: def.description ?? null,
          image: null,
          isActive: true,
          ordre: i + 1,
          createdAt: maintenant,
          updatedAt: maintenant,
        });
        def.sousRayons.forEach((nom, j) => {
          sousRayons.push({
            id: crypto.randomUUID(),
            nom,
            // Préfixé par le rayon : « Chaussures » existe dans plusieurs rayons.
            slug: `${slug}-${slugifier(nom)}`,
            description: null,
            image: null,
            isActive: true,
            rayonId: id,
            ordre: j + 1,
            createdAt: maintenant,
            updatedAt: maintenant,
          });
        });
      });

      await queryInterface.bulkInsert('rayons', rayons, { transaction });
      if (sousRayons.length)
        await queryInterface.bulkInsert('sous_rayons', sousRayons, { transaction });
      // eslint-disable-next-line no-console
      console.log(
        `[catalogue-rayons] ${rayons.length} rayons et ${sousRayons.length} sous-rayons créés`
      );
    });
    void Sequelize;
  },

  // Les anciens rayons ne sont pas restaurables : rien à défaire.
  async down() {},
};
