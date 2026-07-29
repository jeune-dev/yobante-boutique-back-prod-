// ─────────────────────────────────────────────────────────────
// routes/client/profil.route.js   — Préfixe : /api/profile
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/client/profil.controller');
const auth = require('../../middlewares/auth.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const upload = require('../../middlewares/upload.middleware');
const uploadHandler = require('../../middlewares/uploadHandler');
const validate = require('../../middlewares/validate.middleware');
const { updateProfilSchema } = require('../../validations/profil.validation');
const { adresseSchema, updateAdresseSchema } = require('../../validations/adresse.validation');

router.use(auth, checkActiveUser);

router.get('/', ctrl.get);
router.put('/', validate(updateProfilSchema), ctrl.update);
router.put('/avatar', uploadHandler.singleFile(upload.single('avatar'), 5), ctrl.updateAvatar);

router.get('/adresses', ctrl.getAdresses);
router.post('/adresses', validate(adresseSchema), ctrl.ajouterAdresse);
router.put('/adresses/:id', validate(updateAdresseSchema), ctrl.updateAdresse);
router.delete('/adresses/:id', ctrl.supprimerAdresse);
router.patch('/adresses/:id/default', ctrl.setDefault);

module.exports = router;
