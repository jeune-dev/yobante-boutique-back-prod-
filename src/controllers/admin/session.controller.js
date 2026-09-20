// ─────────────────────────────────────────────────────────────
// controllers/admin/session.controller.js — Session du dashboard
// ─────────────────────────────────────────────────────────────
const { User } = require('../../models');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { NotFoundError } = require('../../errors/AppError');
const formatUser = require('../../utils/formatUser');

/**
 * GET /api/v1/admin/me
 * Administrateur porté par le jeton. Le rôle a déjà été contrôlé par
 * `adminMiddleware` : arriver ici garantit un compte ADMIN actif. Le
 * dashboard s'en sert pour invalider une session locale forgée ou périmée.
 */
exports.me = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) throw new NotFoundError('Utilisateur introuvable');
  return ok(res, { user: formatUser(user) }, 'Session administrateur valide');
});
