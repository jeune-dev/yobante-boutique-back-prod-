const SignalementService = require('../../services/client/signalement.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const { NotFoundError, ConflictError, BadRequestError } = require('../../errors/AppError');

const lever = (resultat) => {
  if (resultat.status === 404) throw new NotFoundError(resultat.message);
  if (resultat.status === 409) throw new ConflictError(resultat.message);
  throw new BadRequestError(resultat.message);
};

/** POST /api/v1/signalements — { type, cibleId, raison, description? } */
exports.creer = asyncHandler(async (req, res) => {
  const resultat = await SignalementService.creer(req.user.id, req.body);
  if (!resultat.success) lever(resultat);
  return created(res, { signalement: resultat.signalement }, resultat.message);
});

/** GET /api/v1/signalements/mes-signalements */
exports.mesSignalements = asyncHandler(async (req, res) => {
  const resultat = await SignalementService.mesSignalements(req.user.id);
  return ok(res, { signalements: resultat.signalements }, 'Mes signalements');
});
