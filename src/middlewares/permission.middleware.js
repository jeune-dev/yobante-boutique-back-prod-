/**
 * Middleware pour vérifier les permissions granulaires de l'utilisateur
 * Usage: router.delete('/users/:id', permission('delete_users'), deleteUser);
 *
 * Les permissions peuvent être stockées:
 * 1. Dans un array JSON: user.permissions = ["read_reports", "delete_users"]
 * 2. Dans la table de la DB: permissions JSON column
 * 3. Via rôles: role = 'ADMIN' → permissions = ['*'] (tous les droits)
 */
const { ForbiddenError } = require('../errors/AppError');

const permission = (requiredPermission) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Non authentifié', data: null });
  }

  // Cas 1: Utilisateur ADMIN → tous les droits
  if (req.user.role === 'ADMIN') {
    return next();
  }

  // Cas 2: Vérifier les permissions granulaires
  const userPermissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];

  // Wildcard: si l'utilisateur a la permission '*', il a tous les droits
  if (userPermissions.includes('*')) {
    return next();
  }

  // Vérification de permission spécifique
  if (!userPermissions.includes(requiredPermission)) {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé',
      data: null,
      requiredPermission,
    });
  }

  next();
};

module.exports = permission;
