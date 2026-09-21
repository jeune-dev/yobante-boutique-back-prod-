const router = require('express').Router();
const adminAuthCtrl = require('../../controllers/admin/adminAuth.controller');
const { forgotPasswordLimiter, mutationLimiter } = require('../../middlewares/rateLimit.middleware');

router.post('/forgot-password', forgotPasswordLimiter, adminAuthCtrl.forgotPassword);
router.post('/reset-password', mutationLimiter, adminAuthCtrl.resetPassword);

module.exports = router;
