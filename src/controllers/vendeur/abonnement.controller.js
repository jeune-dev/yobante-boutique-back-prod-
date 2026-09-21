const AbonnementService = require('../../services/vendeur/abonnement.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const { NotFoundError, BadRequestError } = require('../../errors/AppError');

const lever = (resultat) => {
  if (resultat.status === 404) throw new NotFoundError(resultat.message);
  throw new BadRequestError(resultat.message);
};

/** Base publique de l'API, nécessaire pour construire les URL de retour. */
const urlBase = (req) => process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

/** Paiement tel qu'exposé au mobile (jamais les détails techniques du fournisseur). */
const formaterPaiement = (p) => ({
  id: p.id,
  montant: p.montant,
  methode: p.methode,
  statut: p.statut,
  transactionId: p.transactionId,
  urlPaiement: p.urlPaiement,
  numeroTelephone: p.numeroTelephone,
  payeAt: p.payeAt,
  createdAt: p.createdAt,
});

/** GET /api/v1/vendeur/abonnement */
exports.monAbonnement = asyncHandler(async (req, res) => {
  const resultat = await AbonnementService.monAbonnement(req.user.id);
  return ok(res, { abonnement: resultat.abonnement }, 'Mon abonnement');
});

/** GET /api/v1/vendeur/abonnement/paiements */
exports.historiquePaiements = asyncHandler(async (req, res) => {
  const resultat = await AbonnementService.historiquePaiements(req.user.id);
  return ok(
    res,
    { paiements: resultat.paiements.map(formaterPaiement) },
    'Historique des paiements'
  );
});

/** GET /api/v1/vendeur/abonnement/paiements/:id */
exports.getPaiement = asyncHandler(async (req, res) => {
  const resultat = await AbonnementService.getPaiement(req.user.id, req.params.id);
  if (!resultat.success) lever(resultat);
  return ok(res, { paiement: formaterPaiement(resultat.paiement) }, 'Paiement');
});

/**
 * POST /api/v1/vendeur/abonnement/payer — { methode, numeroTelephone }
 * POST /api/v1/vendeur/abonnement/renouveler — { methode?, numeroTelephone? }
 * Même traitement : initiation d'un paiement du tarif mensuel.
 */
exports.payer = asyncHandler(async (req, res) => {
  const resultat = await AbonnementService.initierPaiement(req.user.id, req.body, urlBase(req));
  if (!resultat.success) lever(resultat);
  return created(res, { paiement: formaterPaiement(resultat.paiement) }, resultat.message);
});
