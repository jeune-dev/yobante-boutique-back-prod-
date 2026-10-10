const FraisLivraisonClientService = require('../../services/client/frais-livraison.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { FRAIS_LIVRAISON_DEFAUT } = require('../../constants');

exports.getActifs = asyncHandler(async (req, res) => {
  const result = await FraisLivraisonClientService.getActifs();
  // `fraisParDefaut` : montant appliqué à une ville sans tarif, pour que
  // l'application affiche les frais exacts avant la validation.
  return ok(
    res,
    { frais: result.frais, fraisParDefaut: FRAIS_LIVRAISON_DEFAUT },
    'Tarifs de livraison'
  );
});

exports.getParVille = asyncHandler(async (req, res) => {
  const result = await FraisLivraisonClientService.getParVille(req.params.ville);
  return ok(res, { frais: result.frais }, 'Tarif de livraison');
});
