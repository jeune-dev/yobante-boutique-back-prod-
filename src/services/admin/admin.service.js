const bcrypt = require('bcryptjs');
const { User, sequelize } = require('../../models');
const paginate = require('../../utils/paginate');
const { bcryptConfig } = require('../../config/security');

class GestionAdminService {
  static async listerAdmins({ page, limit } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);

    const { count, rows } = await User.findAndCountAll({
      attributes: { exclude: ['password'] },
      where: { role: 'ADMIN' },
      order: [['createdAt', 'DESC']],
      limit: l,
      offset,
    });

    return {
      message: 'Liste des admins',
      admins: rows,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async ajouterAdmin({ nom, prenom, email, password, telephone }) {
    const t = await sequelize.transaction();

    try {
      const emailClean = email.trim().toLowerCase();

      const exist = await User.findOne({ where: { email: emailClean }, transaction: t });
      if (exist) {
        await t.rollback();
        return { success: false, message: 'Cet email est déjà utilisé' };
      }

      const hashedPassword = await bcrypt.hash(password, bcryptConfig.saltRounds);

      const admin = await User.create(
        {
          nom,
          prenom,
          email: emailClean,
          password: hashedPassword,
          telephone,
          role: 'ADMIN',
          isActive: true,
          isVerified: true,
        },
        { transaction: t }
      );

      await t.commit();

      return { success: true, message: 'Admin créé avec succès', admin };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  static async supprimerAdmin(id) {
    // ✅ SÉCURITÉ: Exclure password depuis la DB
    const admin = await User.findOne({
      where: { id, role: 'ADMIN' },
      attributes: { exclude: ['password'] },
    });
    if (!admin) {
      return { success: false, message: 'Admin introuvable' };
    }

    await admin.destroy();
    return { success: true, message: 'Admin supprimé avec succès' };
  }

  static async modifierAdmin(id, { nom, prenom, telephone }) {
    // ✅ SÉCURITÉ: Exclure password depuis la DB
    const admin = await User.findOne({
      where: { id, role: 'ADMIN' },
      attributes: { exclude: ['password'] },
    });
    if (!admin) {
      return { success: false, message: 'Admin introuvable' };
    }

    await admin.update({ nom, prenom, telephone });
    return { success: true, message: 'Admin mis à jour avec succès', admin };
  }

  static async toggleActivationAdmin(id) {
    // ✅ SÉCURITÉ: Exclure password depuis la DB
    const admin = await User.findOne({
      where: { id, role: 'ADMIN' },
      attributes: { exclude: ['password'] },
    });
    if (!admin) {
      return { success: false, message: 'Admin introuvable' };
    }

    admin.isActive = !admin.isActive;
    await admin.save();

    return {
      success: true,
      message: `Admin ${admin.isActive ? 'activé' : 'désactivé'} avec succès`,
      admin,
    };
  }
}

module.exports = GestionAdminService;
