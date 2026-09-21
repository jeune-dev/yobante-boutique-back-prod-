const fs = require('fs');
const filePath = 'src/services/auth.service.js';
let content = fs.readFileSync(filePath, 'utf8');

const oldMethod = `  static async resetPassword(resetToken, newPassword) {
    const emailClean = email.trim().toLowerCase();
    const user = await User.findOne({ where: { email: emailClean } });
    if (!user) {
      return { success: false, message: 'Aucun compte associé à cet email.' };
    }

    const otpRecord = await UserOtp.findOne({
      where: { userId: user.id, type: 'reset_password', isUsed: false },
      order: [['createdAt', 'DESC']],
    });
    if (!otpRecord) {
      return {
        success: false,
        message: 'Aucun code de réinitialisation trouvé. Veuillez refaire une demande.',
      };
    }

    if (new Date() > otpRecord.expiresAt) {
      return { success: false, message: 'Le code a expiré. Veuillez refaire une demande.' };
    }

    const isValid = await bcrypt.compare(otpRecu, otpRecord.code);
    if (!isValid) {
      return { success: false, message: 'Code de réinitialisation incorrect.' };
    }

    const t = await sequelize.transaction();
    try {
      const hashedPassword = await bcrypt.hash(newPassword, bcryptConfig.saltRounds);
      await user.update({ password: hashedPassword }, { transaction: t });
      await otpRecord.update({ isUsed: true }, { transaction: t });
      await RefreshToken.update(
        { revoked: true },
        { where: { userId: user.id, revoked: false }, transaction: t }
      );

      await t.commit();
      return { success: true, message: 'Mot de passe réinitialisé avec succès.' };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }`;

const newMethod = `  static async resetPassword(resetToken, newPassword) {
    const tokenHash = _hashToken(resetToken);
    const tokenRecord = await PasswordResetToken.findOne({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
    });

    if (!tokenRecord) {
      return { success: false, message: 'Token de réinitialisation invalide ou expiré.' };
    }

    const user = await User.findByPk(tokenRecord.userId);
    if (!user) {
      return { success: false, message: 'Utilisateur introuvable.' };
    }

    const t = await sequelize.transaction();
    try {
      const hashedPassword = await bcrypt.hash(newPassword, bcryptConfig.saltRounds);
      await user.update({ password: hashedPassword }, { transaction: t });
      await tokenRecord.update({ usedAt: new Date() }, { transaction: t });
      await RefreshToken.update(
        { revoked: true },
        { where: { userId: user.id, revoked: false }, transaction: t }
      );

      await t.commit();
      return { success: true, message: 'Mot de passe réinitialisé avec succès.' };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }`;

if (content.includes(oldMethod)) {
  content = content.replace(oldMethod, newMethod);
  fs.writeFileSync(filePath, content);
  console.log('Replaced successfully');
} else {
  console.log('Old method not found');
}
