// ─────────────────────────────────────────────────────────────
// routes/client/acheteur.route.js — Préfixe : /api/v1/acheteurs
// Route publique — recherche de boutiques proches par géolocalisation
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/client/boutique.controller');
const validate = require('../../middlewares/validate.middleware');
const { boutiquesProchesSchema } = require('../../validations/acheteur.validation');

router.get('/boutiques-proches', validate(boutiquesProchesSchema, 'query'), ctrl.proches);

module.exports = router;
