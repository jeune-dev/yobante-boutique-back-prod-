/**
 * ✅ STANDARD API RESPONSE FORMAT
 *
 * ALL responses must follow this structure:
 * {
 *   success: boolean,
 *   message: string,
 *   data: object|array|null
 * }
 */

/**
 * ✅ SUCCESS (200 - OK)
 * GET, PATCH, PUT - data update/retrieval
 */
const ok = (res, data = null, message = 'Succès', status = 200) =>
  res.status(status).json({ success: true, message, data });

/**
 * ✅ SUCCESS (201 - Created)
 * POST - resource creation
 */
const created = (res, data = null, message = 'Créé avec succès') =>
  res.status(201).json({ success: true, message, data });

/**
 * ✅ SUCCESS (204 - No Content)
 * DELETE - resource deleted
 */
const noContent = (res, message = 'Supprimé avec succès') =>
  res.status(204).json({ success: true, message, data: null });

/**
 * ❌ CLIENT ERROR (400 - Bad Request)
 * Invalid input, validation errors
 */
const badRequest = (res, message = 'Requête invalide') =>
  res.status(400).json({ success: false, message, data: null });

/**
 * ❌ AUTHENTICATION ERROR (401 - Unauthorized)
 * Missing/invalid token
 */
const unauthorized = (res, message = 'Non authentifié') =>
  res.status(401).json({ success: false, message, data: null });

/**
 * ❌ AUTHORIZATION ERROR (403 - Forbidden)
 * User doesn't have permission
 */
const forbidden = (res, message = 'Accès refusé') =>
  res.status(403).json({ success: false, message, data: null });

/**
 * ❌ NOT FOUND (404)
 * Resource doesn't exist
 */
const notFound = (res, message = 'Non trouvé') =>
  res.status(404).json({ success: false, message, data: null });

/**
 * ❌ CONFLICT (409)
 * Resource already exists (unique constraint, etc)
 */
const conflict = (res, message = 'Conflit: la ressource existe déjà') =>
  res.status(409).json({ success: false, message, data: null });

/**
 * ❌ SERVER ERROR (500)
 * Unexpected server error
 */
const serverError = (res, message = 'Erreur interne du serveur') =>
  res.status(500).json({ success: false, message, data: null });

/**
 * ❌ GENERIC ERROR
 * Custom status code
 */
const fail = (res, message = 'Erreur', status = 400) =>
  res.status(status).json({ success: false, message, data: null });

module.exports = {
  ok,
  created,
  noContent,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  serverError,
  fail,
};
