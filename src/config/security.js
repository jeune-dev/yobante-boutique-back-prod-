require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_RESET_SECRET = process.env.JWT_RESET_SECRET;
const isProd = process.env.NODE_ENV === 'production';

// ── Validation secrets JWT ─────────────────────────────────────────────────
const missingSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'JWT_RESET_SECRET'].filter(
  (k) => !process.env[k]
);
if (missingSecrets.length) {
  throw new Error(`Variables d'environnement manquantes : ${missingSecrets.join(', ')}`);
}

if (
  JWT_SECRET === JWT_REFRESH_SECRET ||
  JWT_SECRET === JWT_RESET_SECRET ||
  JWT_REFRESH_SECRET === JWT_RESET_SECRET
) {
  throw new Error(
    'JWT_SECRET, JWT_REFRESH_SECRET et JWT_RESET_SECRET doivent tous être différents.'
  );
}

// ── Validation CORS en production ET staging ───────────────────────────────
// ✅ SÉCURITÉ: Jamais d'CORS "*" autorisé, même en dev/staging
const _rawCorsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Validation stricte: CORS "*" jamais autorisé
if (_rawCorsOrigins.includes('*')) {
  throw new Error(
    'CORS_ORIGIN=* est JAMAIS autorisé, même en dev. Définissez des origines explicites.'
  );
}

// Production: CORS_ORIGIN obligatoire
if (isProd && _rawCorsOrigins.length === 0) {
  throw new Error('En production, CORS_ORIGIN doit être défini (ex: https://votre-frontend.com)');
}

// Staging: Aussi nécessaire (données sensibles)
if (!isProd && _rawCorsOrigins.length === 0) {
  // En dev local, autoriser localhost seulement
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    // OK, default sera appliqué ci-dessous
  } else {
    // Staging: Ne pas permettre pas de CORS_ORIGIN
    throw new Error('En staging, CORS_ORIGIN doit être défini (ne pas utiliser localhost)');
  }
}

// ── Validation credentials Admin en production ─────────────────────────
if (isProd) {
  if (!process.env.ADMIN_EMAIL || process.env.ADMIN_EMAIL === 'admin@yobante.com') {
    throw new Error('En production, changez ADMIN_EMAIL (valeur par défaut interdite)');
  }
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'Admin1234!') {
    throw new Error('En production, changez ADMIN_PASSWORD (valeur par défaut interdite)');
  }
}

/**
 * Configuration JWT
 */
const jwtConfig = {
  secret: JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  refreshSecret: JWT_REFRESH_SECRET,
  refreshExpiresIn: '7d',
  resetSecret: JWT_RESET_SECRET,
  resetExpiresIn: '1h',
};

/**
 * Configuration Bcrypt
 */
const bcryptConfig = {
  saltRounds: 12,
};

/**
 * Rate Limiting (anti brute force)
 * Filet de sécurité global par IP (anti-scan/DDoS) — appliqué à TOUTES les routes
 * Volontairement large : la limite fine par utilisateur prend le relais après auth
 * ✅ PERF: Augmenté de 1000 à 10000 pour supporter 1000+ RPS
 */
const rateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.GLOBAL_RATE_LIMIT_MAX || '10000'), // 10K req/15min = ~11 req/sec per IP
  standardHeaders: true,
  legacyHeaders: false,
};

// Limite par utilisateur authentifié (clé = req.user.id, pas l'IP)
const authenticatedRateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { success: false, message: 'Trop de requêtes. Veuillez réessayer dans 15 minutes.' },
};

// Authentification (login/register) — très strict
const authRateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de tentatives. Veuillez réessayer dans 15 minutes.' },
};

// Mutations sensibles (modifier/supprimer profil, changement mot de passe)
const mutationRateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de requêtes. Veuillez réessayer dans 15 minutes.' },
};

// Routes admin — modérément strict
const adminRateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de requêtes admin. Veuillez réessayer.' },
};

// OTP email — anti-spam strict
const otpEmailRateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Trop de tentatives pour cet email. Réessayez dans 15 minutes.',
  },
};

/**
 * CORS sécurisé
 */
const corsConfig = {
  origin: _rawCorsOrigins.length ? _rawCorsOrigins : ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

/**
 * Cookies (si refresh token)
 */
const cookieConfig = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict',
};

/**
 * Upload fichiers (images produits, catégories, avatar)
 */
const uploadConfig = {
  maxFileSize: 5 * 1024 * 1024, // 5 MB
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
};

/**
 * Chiffrement & Hash
 */
const cryptoConfig = {
  hashAlgorithm: 'sha256',
  encoding: 'hex',
};

module.exports = {
  jwtConfig,
  bcryptConfig,
  rateLimitConfig,
  authenticatedRateLimitConfig,
  authRateLimitConfig,
  mutationRateLimitConfig,
  adminRateLimitConfig,
  otpEmailRateLimitConfig,
  corsConfig,
  cookieConfig,
  uploadConfig,
  cryptoConfig,
};
