'use strict';
const router = require('express').Router();
const ctrl = require('../../controllers/admin/rayon.controller');
// auth.middleware exporte une seule fonction, pas { authenticate, authorize }.
// adminMiddleware authentifie et exige le rôle ADMIN, comme toutes les autres
// routes de ce dossier.
const adminMiddleware = require('../../middlewares/admin.middleware');
const validate = require('../../middlewares/validate.middleware');
const { creerRayonSchema, modifierRayonSchema } = require('../../validations/rayon.validation');

router.use(adminMiddleware);
router.get('/', ctrl.lister);
router.post('/', validate(creerRayonSchema), ctrl.creer);

// Les chemins littéraux passent avant `/:id`, sinon Express fait correspondre
// `PUT /sous-rayons/<uuid>` à `PUT /:id` avec id = "sous-rayons".
router.put('/sous-rayons/:id', validate(modifierRayonSchema), ctrl.modifierSousRayon);
router.patch('/sous-rayons/:id/archiver', ctrl.archiverSousRayon);

router.get('/:id', ctrl.getById);
router.put('/:id', validate(modifierRayonSchema), ctrl.modifier);
router.patch('/:id/archiver', ctrl.archiver);
router.get('/:rayonId/sous-rayons', ctrl.listerSousRayons);
router.post('/:rayonId/sous-rayons', validate(creerRayonSchema), ctrl.creerSousRayon);
module.exports = router;
