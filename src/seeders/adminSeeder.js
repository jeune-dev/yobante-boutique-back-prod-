// ─────────────────────────────────────────────────────────────
// seeders/adminSeeder.js — Création du compte admin initial
// ─────────────────────────────────────────────────────────────
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { bcryptConfig } = require('../config/security');
const logger = require('../config/logger');

/**
 * Seed admin user
 * Crée un compte admin s'il n'existe pas déjà
 * ⚠️  SÉCURITÉ: Force env vars (jamais de defaults hardcodés)
 * N'appelle jamais process.exit() pour ne pas tuer le serveur
 */
async function seedAdmin() {
  try {
    // ✅ SÉCURITÉ: Forcer env vars, jamais de defaults
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const nom = process.env.ADMIN_NOM;
    const prenom = process.env.ADMIN_PRENOM;

    // ✅ SÉCURITÉ: Validation stricte des env vars
    if (!email || !password || !nom || !prenom) {
      logger.warn("❌ Admin seeder: Variables d'environnement manquantes");
      logger.warn('   Définissez: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOM, ADMIN_PRENOM');
      return;
    }

    // ✅ SÉCURITÉ: Interdire les values par défaut même si définies
    const forbiddenDefaults = ['admin@yobante.com', 'Admin1234!', 'admin', 'yobante'];
    if (forbiddenDefaults.includes(email.toLowerCase()) || forbiddenDefaults.includes(password)) {
      throw new Error('❌ Admin seeder: Valeurs par défaut interdites en production');
    }

    // Vérifier si admin existe déjà
    const existant = await User.findOne({ where: { email } });
    if (existant) {
      logger.debug(`Admin existe déjà : ${email}`);
      return;
    }

    // Créer l'admin
    const hashedPassword = await bcrypt.hash(password, bcryptConfig.saltRounds);
    await User.create({
      nom,
      prenom,
      email,
      password: hashedPassword,
      role: 'ADMIN',
      isActive: true,
      isVerified: true,
    });

    logger.info(`✅ Admin créé : ${email}`);
  } catch (err) {
    logger.error('❌ Erreur seed admin', { error: err.message });
    throw err;
  }
}

module.exports = seedAdmin;
