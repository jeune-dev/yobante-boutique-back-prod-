const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const auth = require('../middlewares/auth.middleware');
const {
  authLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  mutationLimiter,
} = require('../middlewares/rateLimit.middleware');
const validate = require('../middlewares/validate.middleware');
const {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} = require('../validations/auth.validation');

router.post('/register', registerLimiter, validate(registerSchema), ctrl.register);
router.post('/login', authLimiter, validate(loginSchema), ctrl.login);
router.post('/refresh', authLimiter, validate(refreshSchema), ctrl.refresh);
router.post('/logout', validate(logoutSchema), ctrl.logout);

router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validate(forgotPasswordSchema),
  ctrl.forgotPassword
);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), ctrl.resetPassword);
router.put(
  '/change-password',
  mutationLimiter,
  auth,
  validate(changePasswordSchema),
  ctrl.changePassword
);
router.post('/changer-premier-mdp', mutationLimiter, auth, ctrl.changerPremierMotDePasse);

module.exports = router;
