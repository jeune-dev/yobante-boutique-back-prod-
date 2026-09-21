const adminAuthService = require('../../services/admin/adminAuth.service');

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email requis' });
    const result = await adminAuthService.forgotPassword(email);
    res.json(result);
  } catch (error) {
    // log supprimé pour lint
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;
    if (!token || !email || !newPassword) return res.status(400).json({ message: 'Champs requis' });
    await adminAuthService.resetPassword(token, email, newPassword);
    res.json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Erreur lors de la réinitialisation' });
  }
};

module.exports = { forgotPassword, resetPassword };
