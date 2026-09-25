// ─────────────────────────────────────────────────────────────
// routes/admin/user.route.js   — Préfixe : /api/admin/users
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/admin/user.controller');
const adminMiddleware = require('../../middlewares/admin.middleware');
const validate = require('../../middlewares/validate.middleware');
const { creerAdminSchema, modifierAdminSchema } = require('../../validations/admin.validation');

// ── Route unifiée ────────────────────────────────────────────────────────────
router.get('/', adminMiddleware, ctrl.getAll);
router.patch('/:id/toggle', adminMiddleware, ctrl.toggleActivation);

// ── Admins ──────────────────────────────────────────────────────────────────
// Pas de suppression : un administrateur se bloque, son historique reste.
// Aucun mot de passe n'est saisi : il est généré et envoyé par email.
router.get('/admins', adminMiddleware, ctrl.listeAdmins);
router.post('/admins', adminMiddleware, validate(creerAdminSchema), ctrl.ajouterAdmin);
router.get('/admins/:id', adminMiddleware, ctrl.getAdmin);
router.put('/admins/:id', adminMiddleware, validate(modifierAdminSchema), ctrl.modifierAdmin);
router.post('/admins/:id/renvoyer-identifiants', adminMiddleware, ctrl.renvoyerIdentifiantsAdmin);
router.patch('/admins/:id/bloquer', adminMiddleware, ctrl.bloquerAdmin);
router.patch('/admins/:id/debloquer', adminMiddleware, ctrl.debloquerAdmin);

// ── Clients ─────────────────────────────────────────────────────────────────
router.get('/clients', adminMiddleware, ctrl.listeClients);
router.get('/clients/count', adminMiddleware, ctrl.nombreClients);
router.get('/clients/export', adminMiddleware, ctrl.exportClients);
router.patch('/clients/:id/activer', adminMiddleware, ctrl.activerClient);
router.patch('/clients/:id/desactiver', adminMiddleware, ctrl.desactiverClient);

module.exports = router;
