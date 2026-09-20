const SuppressionCompteService = require('../../services/client/suppressionCompte.service');
const asyncHandler = require('../../utils/asyncHandler');
const { created } = require('../../utils/response');

exports.creer = asyncHandler(async (req, res) => {
  const { email, objet } = req.body;
  await SuppressionCompteService.creerDemande({ email, objet });
  return created(
    res,
    {},
    'Votre demande a bien été enregistrée. Nous la traiterons dans les meilleurs délais.'
  );
});
