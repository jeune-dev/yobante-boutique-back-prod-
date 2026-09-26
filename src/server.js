require('dotenv').config();
const cluster = require('cluster');
const sequelize = require('./config/db');
const logger = require('./config/logger');
const app = require('./app');

// Initialise toutes les associations Sequelize
require('./models');

const isProd = process.env.NODE_ENV === 'production';
const CLUSTER_WORKERS = parseInt(process.env.CLUSTER_WORKERS || '1', 10);
const clusteringActif = isProd && CLUSTER_WORKERS > 1;

// Un seul worker lance migrations/seeds/cron
const estWorkerPrincipal = !cluster.isWorker || cluster.worker.id === 1;

// ── Handlers process non capturées ────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', { message: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { reason: String(reason) });
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM reçu — arrêt propre');
  process.exit(0);
});

/**
 * Applique les migrations runtime (colonnes, enums, index)
 * De façon idempotente — plusieurs appels sont sûrs
 */
async function applyRuntimeMigrations() {
  const qi = sequelize.getQueryInterface();
  const { DataTypes } = require('sequelize');

  logger.info('Application des migrations runtime…');

  // ── COLONNES MANQUANTES ────────────────────────────────────────────────────

  // Exemple: Ajouter colonne si manquante
  try {
    const cols = await qi.describeTable('Produit');
    if (!cols.sku) {
      await qi.addColumn('Produit', 'sku', {
        type: DataTypes.STRING(100),
        unique: true,
        allowNull: true,
      });
      logger.info('Migration: colonne SKU ajoutée à Produit');
    }
  } catch (e) {
    logger.warn('Migration SKU (Produit): ' + e.message);
  }

  // Colonne pour permissions granulaires (optionnel)
  try {
    const cols = await qi.describeTable('Utilisateur');
    if (!cols.permissions) {
      await qi.addColumn('Utilisateur', 'permissions', {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
      });
      logger.info('Migration: colonne permissions ajoutée à Utilisateur');
    }
  } catch (e) {
    logger.warn('Migration permissions (Utilisateur): ' + e.message);
  }

  // ── INDEX ──────────────────────────────────────────────────────────────────
  // Créer index sur clés étrangères pour performance (CRITICAL for scalability)
  // Sans ça, les requêtes WHERE clientId = ? dégénèrent en scan séquentiel

  const indexACreer = [
    { table: 'Commande', colonne: 'clientId' },
    { table: 'Commande', colonne: 'vendeurId' },
    { table: 'Commande', colonne: 'statut' },
    { table: 'Panier', colonne: 'clientId' },
    { table: 'Produit', colonne: 'vendeurId' },
    { table: 'Produit', colonne: 'categorieId' },
    { table: 'Avis', colonne: 'produitId' },
    { table: 'Avis', colonne: 'clientId' },
    { table: 'Promotion', colonne: 'produitId' },
    { table: 'Favori', colonne: 'clientId' },
    { table: 'Favori', colonne: 'produitId' },
  ];

  for (const { table, colonne } of indexACreer) {
    try {
      await qi.addIndex(table, [colonne]);
      logger.info(`Migration: index créé sur ${table}.${colonne}`);
    } catch (e) {
      // "already exists" est normal au redémarrage — pas une vraie erreur
      if (!/already exists/i.test(e.message)) {
        logger.warn(`Migration index (${table}.${colonne}): ` + e.message);
      }
    }
  }

  logger.info('Migrations runtime terminées');
}

/**
 * Aligne la base sur les modèles avant de servir : colonnes / valeurs d'ENUM
 * manquantes ajoutées, puis tables et index manquants créés (sync).
 * Un `sequelize.sync()` seul échouait dès qu'un index portait sur une colonne
 * absente, et le serveur s'arrêtait — y compris pendant un déploiement, avant
 * que `npm run migrate` ait pu réparer le schéma. Uniquement additif.
 * Un échec est journalisé sans empêcher le démarrage : l'API reste
 * disponible et `npm run schema:verifier` donne le détail.
 */
async function synchroniserSchema() {
  const { reconcilierSchema } = require('./utils/schemaReconciliation');
  try {
    const ajoutes = await reconcilierSchema(sequelize, {
      log: (message) => logger.warn(`[schéma] ${message}`),
    });
    const total = ajoutes.tables.length + ajoutes.colonnes.length + ajoutes.valeursEnum.length;
    if (total) logger.warn(`[schéma] ${total} élément(s) manquant(s) ajouté(s) au démarrage`);
  } catch (err) {
    logger.error('[schéma] Alignement de la base impossible au démarrage', {
      error: err.message,
    });
  }
}

/**
 * Démarre ce process en tant que serveur applicatif
 */
async function demarrerWorker() {
  try {
    // ── SYNC DB ────────────────────────────────────────────────────────────────
    // IMPORTANT: Migrations Sequelize CLI s'exécutent MANUELLEMENT via SSH/deploy.sh
    // AVANT le démarrage du container. Voir deploy/deploy.sh ligne 47.
    if (isProd) {
      if (estWorkerPrincipal) {
        // Production: sync({ force: false }) crée UNIQUEMENT les tables manquantes
        // Migrations Sequelize CLI (exécutées via SSH) gèrent les ALTER TABLE explicitement
        await synchroniserSchema();
        await applyRuntimeMigrations();
        logger.info('Connexion PostgreSQL établie et tables synchronisées (production)');
      } else {
        // Les autres workers vérифient la connexion
        await sequelize.authenticate();
      }
    } else {
      // Dev: sync({ force: false }) comme la prod — évite les erreurs SQL avec ENUM
      // Les migrations Sequelize CLI gèrent les ALTER TABLE explicitement
      await synchroniserSchema();
      logger.info('Base de données synchronisée (mode développement)');
    }

    // ── SEEDERS ET TÂCHES CRON — WORKER PRINCIPAL SEULEMENT ─────────────────────
    if (estWorkerPrincipal) {
      const seedAdmin = require('./seeders/adminSeeder');
      await seedAdmin();
      logger.info('Seed admin vérifié');

      const seedBlocsPromo = require('./seeders/blocPromoSeeder');
      await seedBlocsPromo();
      logger.info('Seed blocs promo vérifié');

      const { startCleanupJob } = require('./jobs/cleanupExpiredTokens.job');
      startCleanupJob();
      logger.info('Jobs de nettoyage démarrés');
    }

    // ── ÉCOUTE HTTP ─────────────────────────────────────────────────────────────
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, '0.0.0.0', () => {
      const suffixe = clusteringActif ? ` [worker ${cluster.worker.id}, pid ${process.pid}]` : '';
      logger.info(
        `Serveur lancé sur le port ${PORT} [${process.env.NODE_ENV || 'development'}]${suffixe}`
      );
    });
  } catch (err) {
    logger.error('Erreur fatale au démarrage', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

// ── POINT D'ENTRÉE ──────────────────────────────────────────────────────────
if (clusteringActif && cluster.isPrimary) {
  logger.info(
    `[cluster] Process primaire ${process.pid} — lancement de ${CLUSTER_WORKERS} workers`
  );

  for (let i = 0; i < CLUSTER_WORKERS; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.error(
      `[cluster] Worker ${worker.process.pid} arrêté (code=${code}, signal=${signal}) — relance`
    );
    cluster.fork();
  });

  process.on('SIGTERM', () => {
    logger.info('[cluster] SIGTERM reçu sur le primaire — arrêt propre des workers');
    for (const id in cluster.workers) {
      cluster.workers[id].process.kill('SIGTERM');
    }
  });
} else {
  demarrerWorker();
}

module.exports = app;
