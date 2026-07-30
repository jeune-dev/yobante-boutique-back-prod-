require('dotenv').config();
const { Sequelize } = require('sequelize');
const logger = require('./logger');

const isProd = process.env.NODE_ENV === 'production';
const useSSL = process.env.DB_SSL === 'true';

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: useSSL ? { require: true, rejectUnauthorized: false } : false,
    keepAlives: true,
    keepAliveInitialDelayMs: 0,
    socketTimeoutMs: 60000,
    statement_timeout: 30000,
    application_name: 'yobante-api',
  },
  pool: {
    // ✅ PERF: Augmenter pool pour supporter plus de connexions concurrentes
    max: parseInt(process.env.DB_POOL_MAX, 10) || (isProd ? 100 : 20),
    min: parseInt(process.env.DB_POOL_MIN, 10) || (isProd ? 20 : 2),
    acquire: 60000, // Augmenter à 60s (au lieu de 30s)
    idle: 30000, // Augmenter à 30s (au lieu de 10s)
    evict: 5000, // Réduire à 5s (recycle plus vite)
    validate: (connection) => {
      // Vérifier que la connexion n'est pas morte avant la réutiliser
      return connection !== null && connection !== undefined;
    },
  },
  define: { freezeTableName: true },
});

module.exports = sequelize;
