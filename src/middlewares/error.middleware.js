'use strict';
const { AppError } = require('../errors/AppError');
const logger = require('../config/logger');

// Évalué à chaque appel et non à l'import : NODE_ENV peut être positionné
// après le chargement du module (tests, scripts), et une constante figée
// désactiverait silencieusement le masquage des messages en production.
const enProd = () => process.env.NODE_ENV === 'production';

// ── REDACTION DES DONNÉES SENSIBLES ────────────────────────────────────────────
const CHAMPS_SENSIBLES = [
  'password',
  'oldPassword',
  'newPassword',
  'token',
  'refreshToken',
  'code',
  'otp',
  'apiKey',
  'secret',
  'pin',
  'cvv',
  'cardNumber',
];

// ✅ PERF: Redaction optimisée sans deep clone JSON coûteux
function redactBody(body) {
  if (!body || typeof body !== 'object') return body;

  // Shallow copy + selective redaction (au lieu de deep clone)
  const clean = Object.assign({}, body);

  for (const key of Object.keys(clean)) {
    if (CHAMPS_SENSIBLES.some((champ) => key.toLowerCase().includes(champ))) {
      clean[key] = '[REDACTED]';
    }
  }

  return clean;
}

/**
 * Réponse d'erreur uniforme, la même enveloppe que les succès :
 *   { success: false, message, data: null }
 * Les erreurs de validation portent en plus le détail par champ :
 *   data: { errors: [{ champ, message }] }
 */
const repondre = (res, status, message, data = null) =>
  res.status(status).json({ success: false, message, data });

const errorMiddleware = (err, req, res, _next) => {
  logger.error(err.message, {
    name: err.name,
    statusCode: err.statusCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
    stack: err.stack,
    body: redactBody(req.body),
  });

  if (err instanceof AppError && err.isOperational) {
    const data = err.details && err.details.length ? { errors: err.details } : null;
    return repondre(res, err.statusCode, err.message, data);
  }

  // Joi : validate.middleware.js propage l'erreur brute via next(err).
  // Sans cette branche, toute validation échouée ressortirait en 500.
  // Le message est le premier détail Joi (lisible, en français dans les
  // schémas) : le mobile l'affiche tel quel. Le détail par champ est dans
  // `data.errors` ; il ne contient aucune donnée technique.
  if (err.isJoi) {
    const errors = (err.details || []).map((d) => ({
      champ: Array.isArray(d.path) ? d.path.join('.') : '',
      message: d.message.replace(/"/g, ''),
    }));
    return repondre(res, 400, errors[0]?.message || 'Données invalides', { errors });
  }

  if (err.name === 'TokenExpiredError') return repondre(res, 401, 'Token expiré');
  if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError')
    return repondre(res, 401, 'Token invalide');

  if (err.name === 'MulterError') {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Fichier trop volumineux (max 5 MB)'
        : "Erreur lors de l'envoi du fichier";
    return repondre(res, 400, message);
  }

  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError)
    return repondre(res, 400, 'Corps de requête JSON invalide');

  if (err.status === 413 || err.type === 'entity.too.large')
    return repondre(res, 413, 'Corps de la requête trop volumineux');

  if (err.name === 'SequelizeValidationError')
    return repondre(res, 422, 'Données invalides', {
      errors: (err.errors || []).map((e) => ({ champ: e.path, message: e.message })),
    });
  if (err.name === 'SequelizeUniqueConstraintError')
    return repondre(res, 409, 'Cette ressource existe déjà');
  // 22P02 : PostgreSQL refuse la valeur (UUID mal formé dans l'URL, valeur
  // hors d'un ENUM…). C'est une donnée invalide envoyée par l'appelant, pas
  // une panne du serveur.
  if (err.name === 'SequelizeDatabaseError' && err.parent?.code === '22P02')
    return repondre(res, 400, 'Identifiant ou valeur invalide');
  if (err.name === 'SequelizeForeignKeyConstraintError')
    return repondre(res, 400, 'Référence invalide : ressource liée introuvable');
  if (
    [
      'SequelizeConnectionError',
      'SequelizeConnectionRefusedError',
      'SequelizeConnectionTimedOutError',
      'SequelizeTimeoutError',
    ].includes(err.name)
  )
    return repondre(res, 503, 'Service temporairement indisponible');

  // Erreurs nommées émises hors AppError (librairies tierces, express-jwt…).
  const parNom = {
    ValidationError: [400, 'Données invalides'],
    UnauthorizedError: [401, err.message],
    ForbiddenError: [403, err.message],
    NotFoundError: [404, err.message],
  }[err.name];
  if (parNom) return repondre(res, parNom[0], parNom[1]);

  // Erreurs portant leur propre statut : `http-errors` et Express posent
  // `status`, d'autres `statusCode`. Sans cette branche, un 404 ou un 403 émis
  // par une librairie ressortirait en 500.
  const statutPorte = Number(err.status || err.statusCode);
  if (Number.isInteger(statutPorte) && statutPorte >= 400 && statutPorte <= 599) {
    // Un message de 5xx peut exposer des détails internes : on le masque en prod.
    const masque = enProd() && statutPorte >= 500;
    return repondre(
      res,
      statutPorte,
      masque ? 'Erreur interne du serveur' : err.message || 'Erreur interne du serveur'
    );
  }

  const message = enProd()
    ? 'Erreur interne du serveur'
    : err.message || 'Erreur interne du serveur';
  return repondre(res, 500, message);
};

module.exports = errorMiddleware;
