const NotificationService = require('../../services/notification');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { NotFoundError, BadRequestError } = require('../../errors/AppError');

/** GET /api/v1/notifications */
exports.lister = asyncHandler(async (req, res) => {
  const resultat = await NotificationService.lister(req.user.id, req.query);
  return ok(
    res,
    { notifications: resultat.notifications, pagination: resultat.pagination },
    'Notifications'
  );
});

/** GET /api/v1/notifications/non-lues — alimente le compteur de la cloche */
exports.compterNonLues = asyncHandler(async (req, res) => {
  const resultat = await NotificationService.compterNonLues(req.user.id);
  return ok(res, { total: resultat.total }, 'Notifications non lues');
});

/** PATCH /api/v1/notifications/:id/lire */
exports.marquerLue = asyncHandler(async (req, res) => {
  const resultat = await NotificationService.marquerLue(req.user.id, req.params.id);
  if (!resultat.success) throw new NotFoundError(resultat.message);
  return ok(res, {}, resultat.message);
});

/** PATCH /api/v1/notifications/toutes-lues */
exports.toutMarquerLu = asyncHandler(async (req, res) => {
  const resultat = await NotificationService.toutMarquerLu(req.user.id);
  return ok(res, { total: resultat.total }, resultat.message);
});

/** POST /api/v1/device-token/register */
exports.enregistrerAppareil = asyncHandler(async (req, res) => {
  const resultat = await NotificationService.enregistrerAppareil(req.user.id, req.body);
  if (!resultat.success) throw new BadRequestError(resultat.message);
  return ok(res, {}, resultat.message);
});

/** POST /api/v1/device-token/unregister */
exports.supprimerAppareil = asyncHandler(async (req, res) => {
  const { token } = req.body || {};
  if (typeof token !== 'string' || !token.trim()) {
    throw new BadRequestError("Le jeton de l'appareil est obligatoire");
  }
  const resultat = await NotificationService.supprimerAppareil(req.user.id, req.body.token);
  return ok(res, {}, resultat.message);
});
