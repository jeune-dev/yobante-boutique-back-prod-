const VendeurCommandeService = require('../../services/vendeur/commande.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { NotFoundError, BadRequestError, ConflictError } = require('../../errors/AppError');

/** Traduit le `status` renvoyé par le service en erreur HTTP typée. */
const remonter = (result) => {
  if (result.status === 404) throw new NotFoundError(result.message);
  if (result.status === 409) throw new ConflictError(result.message);
  throw new BadRequestError(result.message);
};

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

exports.accepter = asyncHandler(async (req, res) => {
  const result = await VendeurCommandeService.decider(req.user.id, req.params.id, {
    statut: 'acceptee',
  });
  if (!result.success) remonter(result);
  return ok(res, { decision: result.decision }, result.message);
});

exports.refuser = asyncHandler(async (req, res) => {
  const result = await VendeurCommandeService.decider(req.user.id, req.params.id, {
    statut: 'refusee',
    motif: req.body?.motif,
  });
  if (!result.success) remonter(result);
  return ok(res, { decision: result.decision }, result.message);
});

exports.getTauxAcceptation = asyncHandler(async (req, res) => {
  const result = await VendeurCommandeService.getTauxAcceptation(req.user.id);
  return ok(res, { acceptation: result.acceptation }, "Taux d'acceptation");
});
