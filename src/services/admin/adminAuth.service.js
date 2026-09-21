const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, AdminPasswordReset } = require('../../models');
const mailerService = require('../mailer.service');
const adminResetPasswordTemplate = require('../../templates/mail/adminResetPassword.template');
const { ROLES } = require('../../constants');

const HASH_ALGO = 'sha256';

const forgotPassword = async (email) => {
  const genericMessage =
    'Si un compte administrateur actif correspond à cet email, un lien de réinitialisation a été envoyé.';

  const user = await User.findOne({ where: { email, role: ROLES.ADMIN, isActive: true } });
  if (!user) {
    return { success: true, message: genericMessage };
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash(HASH_ALGO).update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await AdminPasswordReset.create({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const resetLink = `${process.env.FRONTEND_URL}/admin/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;
  await mailerService.sendEmail(
    email,
    'Réinitialisation de votre mot de passe administrateur',
    adminResetPasswordTemplate({ prenom: user.prenom, nom: user.nom, lienReset: resetLink })
  );

  return { success: true, message: genericMessage };
};

const resetPassword = async (token, email, newPassword) => {
  const tokenHash = crypto.createHash(HASH_ALGO).update(token).digest('hex');
  const now = new Date();

  const reset = await AdminPasswordReset.findOne({
    where: {
      tokenHash,
      expiresAt: { [Op.gt]: now },
      usedAt: null,
    },
    include: [{ model: User, as: 'user' }],
  });

  if (
    !reset ||
    reset.user.email !== email ||
    reset.user.role !== ROLES.ADMIN ||
    !reset.user.isActive
  ) {
    throw new Error('Lien invalide ou expiré');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await reset.user.update({ password: hashedPassword, mustChangePassword: false });
  await reset.update({ usedAt: now });

  return { success: true };
};

module.exports = { forgotPassword, resetPassword };
