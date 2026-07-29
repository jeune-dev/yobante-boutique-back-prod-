// ─────────────────────────────────────────────────────────────
// services/admin/user.service.js
// ─────────────────────────────────────────────────────────────
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, sequelize } = require('../../models');
const { bcryptConfig } = require('../../config/security');
const { ROLES } = require('../../constants');
const paginate = require('../../utils/paginate');
const { toCsv } = require('../../utils/csv');

class GestionUserService {
  static async listerClients({ page, limit, search } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);
    const where = { role: ROLES.CLIENT };
    if (search) {
      where[Op.or] = [
        { nom: { [Op.iLike]: `%${search}%` } },
        { prenom: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await User.findAndCountAll({
      attributes: { exclude: ['password'] },
      where,
      order: [['createdAt', 'DESC']],
      limit: l,
      offset,
    });

    return {
      success: true,
      message: 'Liste des clients',
      clients: rows,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async nombreClients() {
    const total = await User.count({ where: { role: ROLES.CLIENT } });
    return { success: true, message: 'Nombre total de clients', totalClients: total };
  }

  static async getClientById(id) {
    const user = await User.findOne({
      where: { id, role: ROLES.CLIENT },
      attributes: { exclude: ['password'] },
    });
    if (!user) return { success: false, message: 'Client introuvable' };
    return { success: true, user };
  }

  static async activerUser(id) {
    // ✅ SÉCURITÉ: Exclure password depuis la DB
    const user = await User.findByPk(id, {
      attributes: { exclude: ['password'] },
    });
    if (!user) return { success: false, message: 'Utilisateur introuvable' };
    await user.update({ isActive: true });
    return { success: true, message: 'Utilisateur activé avec succès', user };
  }

  static async desactiverUser(id) {
    // ✅ SÉCURITÉ: Exclure password depuis la DB
    const user = await User.findByPk(id, {
      attributes: { exclude: ['password'] },
    });
    if (!user) return { success: false, message: 'Utilisateur introuvable' };
    await user.update({ isActive: false });
    return { success: true, message: 'Utilisateur désactivé avec succès', user };
  }

  static async ajouterAdmin(data) {
    const t = await sequelize.transaction();
    try {
      const emailClean = data.email.trim().toLowerCase();
      const exist = await User.findOne({ where: { email: emailClean }, transaction: t });
      if (exist) {
        await t.rollback();
        return { success: false, message: 'Cet email est déjà utilisé' };
      }
      const hashedPassword = await bcrypt.hash(data.password, bcryptConfig.saltRounds);
      const user = await User.create(
        {
          nom: data.nom,
          prenom: data.prenom,
          email: emailClean,
          password: hashedPassword,
          telephone: data.telephone,
          role: ROLES.ADMIN,
          isActive: true,
          isVerified: true,
        },
        { transaction: t }
      );
      await t.commit();
      const { password: _, ...safeUser } = user.toJSON();
      return { success: true, message: 'Admin créé avec succès', user: safeUser };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  static async listerAdmins({ page, limit } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);
    const { count, rows } = await User.findAndCountAll({
      attributes: { exclude: ['password'] },
      where: { role: ROLES.ADMIN },
      order: [['createdAt', 'DESC']],
      limit: l,
      offset,
    });
    return {
      success: true,
      admins: rows,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async modifierAdmin(id, data) {
    const user = await User.findOne({ where: { id, role: ROLES.ADMIN } });
    if (!user) return { success: false, message: 'Admin introuvable' };
    const allowed = ['nom', 'prenom', 'telephone'];
    const updates = {};
    allowed.forEach((k) => {
      if (data[k] !== undefined) updates[k] = data[k];
    });
    await user.update(updates);
    return { success: true, message: 'Admin mis à jour', user };
  }

  static async supprimerAdmin(id, currentUserId) {
    if (id === currentUserId)
      return { success: false, message: 'Vous ne pouvez pas supprimer votre propre compte' };
    const user = await User.findOne({ where: { id, role: ROLES.ADMIN } });
    if (!user) return { success: false, message: 'Admin introuvable' };
    await user.destroy();
    return { success: true, message: 'Admin supprimé' };
  }

  static async toggleActivationAdmin(id) {
    const user = await User.findOne({ where: { id, role: ROLES.ADMIN } });
    if (!user) return { success: false, message: 'Admin introuvable' };
    user.isActive = !user.isActive;
    await user.save();
    return { success: true, message: `Admin ${user.isActive ? 'activé' : 'désactivé'}`, user };
  }

  // ✅ PERF: Streaming export (pas de chargement en mémoire)
  static async exportUsersStream(res) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="clients-${Date.now()}.csv"`);

    // En-têtes CSV
    res.write('Nom,Prénom,Email,Téléphone,Statut,Vérifié,Date inscription\n');

    let offset = 0;
    const batchSize = 1000; // Traiter 1000 utilisateurs à la fois

    try {
      let hasMore = true;
      while (hasMore) {
        const clients = await User.findAll({
          where: { role: ROLES.CLIENT },
          attributes: [
            'nom',
            'prenom',
            'email',
            'telephone',
            'isActive',
            'isVerified',
            'createdAt',
          ],
          order: [['createdAt', 'DESC']],
          limit: batchSize,
          offset,
          raw: true,
        });

        if (clients.length === 0) {
          hasMore = false;
          break;
        }

        // Écrire chaque ligne dans le stream
        for (const c of clients) {
          const line = `"${c.nom}","${c.prenom}","${c.email}","${c.telephone || ''}","${c.isActive ? 'actif' : 'inactif'}","${c.isVerified ? 'oui' : 'non'}","${c.createdAt.toISOString().slice(0, 10)}"\n`;
          res.write(line);
        }

        offset += batchSize;
      }

      res.end();
    } catch (err) {
      res.status(500).json({ success: false, message: "Erreur lors de l'export" });
    }
  }

  // Ancienne méthode (gardée pour rétrocompatibilité, mais LENTE)
  static async exportUsers() {
    const clients = await User.findAll({
      where: { role: ROLES.CLIENT },
      order: [['createdAt', 'DESC']],
      limit: 10000, // Limite pour éviter les OOM
    });

    const rows = clients.map((c) => ({
      nom: c.nom,
      prenom: c.prenom,
      email: c.email,
      telephone: c.telephone || '',
      isActive: c.isActive ? 'actif' : 'inactif',
      isVerified: c.isVerified ? 'oui' : 'non',
      dateInscription: c.createdAt.toISOString().slice(0, 10),
    }));

    const csv = toCsv(rows, [
      { key: 'nom', label: 'Nom' },
      { key: 'prenom', label: 'Prénom' },
      { key: 'email', label: 'Email' },
      { key: 'telephone', label: 'Téléphone' },
      { key: 'isActive', label: 'Statut' },
      { key: 'isVerified', label: 'Vérifié' },
      { key: 'dateInscription', label: 'Date inscription' },
    ]);

    return { success: true, csv };
  }
}

module.exports = GestionUserService;
