// ─────────────────────────────────────────────────────────────
// controllers/admin/signalement.controller.js
// ─────────────────────────────────────────────────────────────
const SignalementService = require('../../services/client/signalement.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { NotFoundError } = require('../../errors/AppError');

/** GET /api/v1/admin/signalements?statut=&type=&page=&limit= */
exports.getAll = asyncHandler(async (req, res) => {
  const result = await SignalementService.lister(req.query);
  return ok(
    res,
    { signalements: result.signalements, pagination: result.pagination },
    'Signalements récupérés'
  );
});

/** PATCH /api/v1/admin/signalements/:id — { statut, reponseAdmin? } */
exports.traiter = asyncHandler(async (req, res) => {
  const result = await SignalementService.traiter(req.params.id, req.body);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { signalement: result.signalement }, result.message);
});
