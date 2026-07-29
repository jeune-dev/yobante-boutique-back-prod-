// seed-admin.js — Crée le compte admin dans la base de données
// Usage local avec la DB Render :
//   DB_HOST=... DB_USER=... DB_PASSWORD=... DB_NAME=... DB_PORT=5432 NODE_ENV=production node src/seeders/seed-admin.js
// Ou avec DATABASE_URL :
//   DATABASE_URL=postgresql://... NODE_ENV=production node src/seeders/seed-admin.js

require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
// ✅ PERF: Utiliser logger au lieu de console.log
const logger = require('../config/logger');

// ── Connexion ─────────────────────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production';

let sequelize;
if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: isProd ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  });
} else {
  sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    dialectOptions: isProd ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  });
}

// ── Modèle minimal User ───────────────────────────────────────────────────────
const User = sequelize.define(
  'User',
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    nom: { type: DataTypes.STRING, allowNull: false },
    prenom: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, defaultValue: 'CLIENT' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    isVerified: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  { tableName: 'users', freezeTableName: true }
);

// ── Config admin ──────────────────────────────────────────────────────────────
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@yobante.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@1234';
const ADMIN_NOM = 'Admin';
const ADMIN_PRENOM = 'Yobante';

async function seed() {
  await sequelize.authenticate();
  logger.info('DB connection established');

  const existing = await User.findOne({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    logger.info(`Admin already exists: ${ADMIN_EMAIL}`);

    // Met à jour le rôle si nécessaire
    if (existing.role !== 'ADMIN') {
      await existing.update({ role: 'ADMIN', isActive: true, isVerified: true });
      logger.info('Admin role updated to ADMIN');
    }
    await sequelize.close();
    return;
  }

  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await User.create({
    id: uuidv4(),
    nom: ADMIN_NOM,
    prenom: ADMIN_PRENOM,
    email: ADMIN_EMAIL,
    password: hashed,
    role: 'ADMIN',
    isActive: true,
    isVerified: true,
  });

  logger.info(`Admin created: ${ADMIN_EMAIL}`);
  await sequelize.close();
}

seed().catch((err) => {
  logger.error(`Seed admin error: ${err.message}`);
  process.exit(1);
});
