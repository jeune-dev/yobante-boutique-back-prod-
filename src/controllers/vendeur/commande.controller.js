const VendeurCommandeService = require('../../services/vendeur/commande.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { NotFoundError } = require('../../errors/AppError');

exports.getMesCommandes = asyncHandler(async (req, res) => {
  const result = await VendeurCommandeService.getMesCommandes(req.user.id, req.query);
  // Seules les données : `success` du service ne doit pas fuir dans `data`.
  return ok(res, { commandes: result.commandes, pagination: result.pagination }, 'Mes commandes');
});

exports.getVentes = asyncHandler(async (req, res) => {
  const result = await VendeurCommandeService.getVentes(req.user.id, req.query);
  return ok(res, { ventes: result.ventes }, 'Ventes');
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await VendeurCommandeService.getCommandeById(req.user.id, req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { commande: result.commande }, 'Commande');
});
