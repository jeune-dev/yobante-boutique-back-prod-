const router = require('express').Router();
const ctrl = require('../../controllers/client/banniere.controller');

// Route publique — accessible sans authentification
router.get('/', ctrl.getActives);
// Produits mis en avant par une bannière (bouton « Découvrir » de l'application)
router.get('/:id/produits', ctrl.getProduits);

module.exports = router;
