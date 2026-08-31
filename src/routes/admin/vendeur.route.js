const router = require('express').Router();
const adminMiddleware = require('../../middlewares/admin.middleware');
const validate = require('../../middlewares/validate.middleware');
const ctrl = require('../../controllers/admin/vendeur.controller');
const {
  creerVendeurSchema,
  updateProfilVendeurSchema,
} = require('../../validations/vendeur.validation');

router.use(adminMiddleware);

router.get('/', ctrl.listerVendeurs);
router.post('/', validate(creerVendeurSchema), ctrl.creerVendeur);
router.get('/:id', ctrl.getVendeur);
router.put('/:id', validate(updateProfilVendeurSchema), ctrl.updateProfil);

// Statut du vendeur : lecture et bascule. Le circuit de validation en deux
// étapes (valider-step1 / valider-step2 / rejeter) a été retiré — un vendeur
// est actif dès sa création et seul le blocage le désactive.
router.get('/:id/statut', ctrl.getStatut);
router.patch('/:id/bloquer', ctrl.bloquerVendeur);
router.patch('/:id/debloquer', ctrl.debloquerVendeur);

module.exports = router;
