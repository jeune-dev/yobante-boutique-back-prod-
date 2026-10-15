// ─────────────────────────────────────────────────────────────
// routes/client/produit.route.js   — Préfixe : /api/produits
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/client/produit.controller');

router.get('/', ctrl.getCatalogue);
router.get('/featured', ctrl.getFeatured);
router.get('/recherche', ctrl.rechercher);
router.get('/disponibilites', ctrl.getDisponibilites);
router.get('/:id/recommandes', ctrl.getRecommandes);
router.get('/categorie/:slug', ctrl.getByCategorie);
router.get('/:slug', ctrl.getOne);

module.exports = router;
