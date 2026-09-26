const PaiementClientService = require('../../services/client/paiement.service');
const AbonnementService = require('../../services/vendeur/abonnement.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const {
  BadRequestError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
} = require('../../errors/AppError');

/** Traduit le statut renvoyé par le service en erreur typée. */
const lever = (resultat) => {
  switch (resultat.status) {
    case 404:
      throw new NotFoundError(resultat.message);
    case 409:
      throw new ConflictError(resultat.message);
    case 401:
      throw new UnauthorizedError(resultat.message);
    default:
      throw new BadRequestError(resultat.message);
  }
};

/** Base publique de l'API, nécessaire pour construire l'URL de paiement. */
const urlBase = (req) => process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

/** POST /api/v1/commandes/:id/payer */
exports.payer = asyncHandler(async (req, res) => {
  const resultat = await PaiementClientService.initier(req.user.id, req.params.id, urlBase(req));
  if (!resultat.success) lever(resultat);
  return ok(res, { paiement: resultat.paiement }, resultat.message);
});

/** GET /api/v1/commandes/:id/paiement */
exports.statut = asyncHandler(async (req, res) => {
  const resultat = await PaiementClientService.statut(req.user.id, req.params.id);
  if (!resultat.success) lever(resultat);
  return ok(res, { paiement: resultat.paiement }, 'Statut du paiement');
});

/**
 * POST /api/v1/paiements/callback
 * Appelé par le fournisseur — non authentifié par JWT, la confiance repose sur
 * la signature vérifiée dans le service.
 */
exports.callback = asyncHandler(async (req, res) => {
  const { reference, succes } = req.body || {};
  // Sans référence, aucun paiement ne peut être rapproché : requête invalide.
  if (typeof reference !== 'string' || !reference.trim()) {
    throw new BadRequestError('Référence de paiement manquante');
  }
  const donnees = {
    reference,
    succes: succes === true || succes === 'true',
    signature: req.headers['x-paiement-signature'],
    corps: req.body,
  };
  let resultat = await PaiementClientService.traiterCallback(donnees);
  // Référence inconnue côté commandes : c'est peut-être un abonnement vendeur.
  if (!resultat.success && resultat.status === 404) {
    resultat = await AbonnementService.traiterCallback(donnees);
  }
  if (!resultat.success) lever(resultat);
  return ok(res, {}, resultat.message);
});
