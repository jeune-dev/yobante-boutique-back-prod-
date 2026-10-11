'use strict';

const { AppError } = require('../errors/AppError');
const { peutAppeler } = require('../constants/accesAdmin');

/**
 * Restreint un administrateur aux pages qui lui ont été attribuées.
 * Placé après adminMiddleware : `req.user.permissions` vient du profil en
 * cache (purgé à chaque changement d'accès).
 */
function accesAdmin(req, _res, next) {
  if (peutAppeler(req.user?.permissions, req.method, req.path)) return next();
  return next(new AppError("Vous n'avez pas accès à cette partie du dashboard.", 403));
}

module.exports = accesAdmin;
