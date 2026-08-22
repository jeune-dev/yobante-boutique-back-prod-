const rateLimit = require('express-rate-limit');
const {
  rateLimitConfig,
  authenticatedRateLimitConfig,
  authRateLimitConfig,
  mutationRateLimitConfig,
  adminRateLimitConfig,
  otpEmailRateLimitConfig,
  suppressionCompteRateLimitConfig,
} = require('../config/security');

// ── GLOBAL LIMITER ─────────────────────────────────────────────────────────────
// Filet de sécurité anti-scan/DDoS — 1000 req / 15 min par IP
const globalLimiter = rateLimit({
  ...rateLimitConfig,
  keyGenerator: (req) => req.ip,
});

// ── AUTHENTICATED LIMITER ─────────────────────────────────────────────────────
// 300 req / 15 min par userId — endpoints authentifiés
const authenticatedLimiter = rateLimit({
  ...authenticatedRateLimitConfig,
});

// ── AUTH LIMITER (Brute Force Protection) ───────────────────────────────────────
// 5 tentatives / 15 min — login, register, refresh
const authLimiter = rateLimit({
  ...authRateLimitConfig,
  keyGenerator: (req) => req.ip,
  skipSuccessfulRequests: true,
});

// ── REGISTER LIMITER ──────────────────────────────────────────────────────────────
// 5 inscriptions / heure par IP — anti-spam comptes
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: {
    success: false,
    message: 'Trop de créations de compte depuis cette adresse IP. Réessayez dans 1 heure.',
  },
});

// ── FORGOT PASSWORD LIMITER ────────────────────────────────────────────────────
// 3 demandes de reset / heure par IP
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: {
    success: false,
    message: 'Trop de demandes de réinitialisation. Réessayez dans 1 heure.',
  },
});

// ── UPLOAD LIMITER ────────────────────────────────────────────────────────────────
// 20 req / 10 min — uploads images
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { success: false, message: "Trop d'uploads. Réessayez dans 10 minutes." },
});

// ── OTP EMAIL LIMITER ─────────────────────────────────────────────────────────────
// 3 envois d'OTP / 15 min par email — anti-spam email
const otpEmailLimiter = rateLimit({
  ...otpEmailRateLimitConfig,
  keyGenerator: (req) => req.body?.email || req.ip,
});

// ── MUTATION LIMITER (Sensitive Operations) ────────────────────────────────────
// 20 req / 15 min pour opérations sensibles (modifier profil, changer mdp)
const mutationLimiter = rateLimit({
  ...mutationRateLimitConfig,
  keyGenerator: (req) => req.user?.id || req.ip,
});

// ── ADMIN LIMITER ────────────────────────────────────────────────────────────────
// 200 req / 15 min pour routes admin
const adminLimiter = rateLimit({
  ...adminRateLimitConfig,
  keyGenerator: (req) => req.user?.id || req.ip,
});

// ── SUPPRESSION COMPTE LIMITER ─────────────────────────────────────────────────
// 3 demandes / heure par IP+email — anti-spam formulaire public
const suppressionCompteLimiter = rateLimit({
  ...suppressionCompteRateLimitConfig,
  keyGenerator: (req) => `${req.body?.email || ''}:${req.ip}`,
});

module.exports = {
  globalLimiter,
  authLimiter,
  authenticatedLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  uploadLimiter,
  otpEmailLimiter,
  mutationLimiter,
  adminLimiter,
  suppressionCompteLimiter,
};
