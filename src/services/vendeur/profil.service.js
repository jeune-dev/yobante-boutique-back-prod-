// ─────────────────────────────────────────────────────────────
// services/vendeur/profil.service.js
// ─────────────────────────────────────────────────────────────
const { User, ProfilVendeur } = require('../../models');
const { uploadImage } = require('../r2.service');

class VendeurProfilService {
  static async getProfil(userId) {
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] },
      include: [{ model: ProfilVendeur, as: 'profilVendeur' }],
    });
    if (!user) return { success: false, message: 'Vendeur introuvable' };
    return { success: true, profil: user };
  }

  static async updateProfil(userId, data) {
    const profil = await ProfilVendeur.findOne({ where: { userId } });
    if (!profil) return { success: false, message: 'Profil introuvable' };

    const allowed = ['nomBoutique', 'description', 'infoLegale', 'adresseBoutique', 'telephone'];
    const updates = {};
    allowed.forEach((k) => {
      if (data[k] !== undefined) updates[k] = data[k];
    });

    await profil.update(updates);
    return { success: true, message: 'Profil mis à jour', profil };
  }

  static async updateLogo(userId, file) {
    const profil = await ProfilVendeur.findOne({ where: { userId } });
    if (!profil) return { success: false, message: 'Profil introuvable' };

    const logoUrl = await uploadImage(file.buffer, file.originalname, 'vendeurs');
    await profil.update({ logo: logoUrl });
    return { success: true, message: 'Logo mis à jour', logo: logoUrl };
  }
}

module.exports = VendeurProfilService;
