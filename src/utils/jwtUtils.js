/**
 * ✅ REFACTORING: JWT Verification Utilities
 * Extrait la logique dupliquée entre auth.middleware.js et admin.middleware.js
 * Élimine 55+ lignes de duplication, centralise les changements de sécurité
 */

const jwt = require('jsonwebtoken');
const { jwtConfig } = require('../config/security');
const { AppError } = require('../errors/AppError');
const cache = require('../config/cache');
const { User } = require('../models');

const CACHE_TTL = 30; // secondes

class JWTUtils {
  /**
   * Extraire le token du header Authorization
   * Lancle une erreur si format invalide
   */
  static extractToken(req) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      throw new AppError('Token manquant ou invalide', 401);
    }
    return authHeader.split(' ')[1];
  }

  /**
   * Vérifier et décoder le JWT
   * Gère TokenExpiredError et JsonWebTokenError
   */
  static verifyToken(token) {
    try {
      return jwt.verify(token, jwtConfig.secret);
    } catch (err) {
      const message = err.name === 'TokenExpiredError' ? 'Token expiré' : 'Token invalide';
      throw new AppError(message, 401);
    }
  }

  /**
   * Vérifier que le token contient isActive=true
   */
  static validateStatus(decoded) {
    if (!decoded.isActive) {
      throw new AppError('Compte désactivé', 403);
    }
  }

  /**
   * Vérifier et cacher le user
   * Cherche le cache d'abord, puis DB si nécessaire
   * @param {string} userId - ID de l'utilisateur
   * @param {string} cacheKeyPrefix - Préfixe pour la clé cache (auth, admin, etc)
   * @param {string|null} roleRequired - Rôle requis (null = pas de vérification)
   * @returns {Promise<object>} User object avec id, role, isActive
   */
  static async verifyAndCache(userId, cacheKeyPrefix = 'auth', roleRequired = null) {
    const cacheKey = `${cacheKeyPrefix}:${userId}`;

    // 1. Vérifier le cache d'abord (performance)
    const cached = cache.get(cacheKey);
    if (cached && cached.isActive) {
      if (roleRequired && cached.role !== roleRequired) {
        throw new AppError('Accès refusé', 403);
      }
      return cached;
    }

    // 2. Sinon: vérifier en DB (sécurité, juste au cas où)
    const user = await User.findByPk(userId, {
      attributes: ['id', 'isActive', 'role'],
    });

    if (!user || !user.isActive) {
      throw new AppError('Compte désactivé ou introuvable', 403);
    }

    if (roleRequired && user.role !== roleRequired) {
      throw new AppError('Accès refusé', 403);
    }

    // 3. Cacher le résultat pour 30 secondes
    const userObj = { id: user.id, role: user.role, isActive: user.isActive };
    cache.set(cacheKey, userObj, CACHE_TTL);

    return userObj;
  }

  /**
   * Workflow complet: extraire → vérifier → cacher
   * Utilisé par les middlewares
   */
  static async verifyUserFromHeader(req, roleRequired = null) {
    const token = this.extractToken(req);
    const decoded = this.verifyToken(token);
    this.validateStatus(decoded);

    // Vérifier le rôle dans le token aussi (fail fast avant DB query)
    if (roleRequired && decoded.role !== roleRequired) {
      throw new AppError('Accès refusé', 403);
    }

    return await this.verifyAndCache(decoded.id, roleRequired || 'auth', roleRequired);
  }
}

module.exports = JWTUtils;
