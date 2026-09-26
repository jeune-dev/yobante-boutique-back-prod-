// ─────────────────────────────────────────────────────────────
// controllers/admin/user.controller.js
// ─────────────────────────────────────────────────────────────
const GestionAdminService = require('../../services/admin/admin.service');
const GestionUserService = require('../../services/admin/user.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const formatUser = require('../../utils/formatUser');

// ──────────────────────────── ROUTE UNIFIÉE ────────────────────────────────

exports.getAll = asyncHandler(async (req, res) => {
  const { search, page, limit } = req.query;
  const result = await GestionUserService.listerClients({ search, page, limit });
  return ok(
    res,
    { users: result.clients.map(formatUser), pagination: result.pagination },
    result.message
  );
});

exports.toggleActivation = asyncHandler(async (req, res) => {
  const user = await require('../../models').User.findByPk(req.params.id);
  if (!user) throw new NotFoundError('Utilisateur introuvable');
  await user.update({ isActive: !user.isActive });
  return ok(res, { user: formatUser(user) }, `Compte ${user.isActive ? 'activé' : 'désactivé'}`);
});

// ──────────────────────────── ADMINS ───────────────────────────────────────

exports.listeAdmins = asyncHandler(async (req, res) => {
  const { page, limit, search, statut } = req.query;
  const result = await GestionAdminService.listerAdmins({ page, limit, search, statut });
  return ok(res, { admins: result.admins, pagination: result.pagination }, result.message);
});

exports.getAdmin = asyncHandler(async (req, res) => {
  const result = await GestionAdminService.getAdmin(req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { admin: result.admin }, 'Administrateur');
});

exports.ajouterAdmin = asyncHandler(async (req, res) => {
  const { nom, prenom, email, telephone } = req.body;
  const result = await GestionAdminService.ajouterAdmin({ nom, prenom, email, telephone });
  if (!result.success) throw new BadRequestError(result.message);
  return created(res, { admin: result.admin, emailEnvoye: result.emailEnvoye }, result.message);
});

exports.modifierAdmin = asyncHandler(async (req, res) => {
  const { nom, prenom, email, telephone } = req.body;
  const result = await GestionAdminService.modifierAdmin(req.params.id, {
    nom,
    prenom,
    email,
    telephone,
  });
  if (!result.success) {
    if (result.message === 'Administrateur introuvable') throw new NotFoundError(result.message);
    throw new BadRequestError(result.message);
  }
  return ok(res, { admin: result.admin }, result.message);
});

exports.renvoyerIdentifiantsAdmin = asyncHandler(async (req, res) => {
  const result = await GestionAdminService.renvoyerIdentifiants(req.params.id, req.user.id);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { emailEnvoye: result.emailEnvoye, emailDest: result.emailDest }, result.message);
});

exports.bloquerAdmin = asyncHandler(async (req, res) => {
  const result = await GestionAdminService.bloquerAdmin(req.params.id, req.user.id);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { statut: result.statut, isBlocked: result.isBlocked }, result.message);
});

exports.debloquerAdmin = asyncHandler(async (req, res) => {
  const result = await GestionAdminService.debloquerAdmin(req.params.id, req.user.id);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { statut: result.statut, isBlocked: result.isBlocked }, result.message);
});

// ──────────────────────────── CLIENTS ──────────────────────────────────────

exports.listeClients = asyncHandler(async (req, res) => {
  const result = await GestionUserService.listerClients({
    page: req.query.page,
    limit: req.query.limit,
  });
  return ok(
    res,
    { clients: result.clients.map(formatUser), pagination: result.pagination },
    result.message
  );
});

exports.nombreClients = asyncHandler(async (req, res) => {
  const result = await GestionUserService.nombreClients();
  return ok(res, { totalClients: result.totalClients }, result.message);
});

exports.exportClients = asyncHandler(async (req, res) => {
  const result = await GestionUserService.exportUsers();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="clients-${Date.now()}.csv"`);
  return res.status(200).send(result.csv);
});

exports.activerClient = asyncHandler(async (req, res) => {
  const result = await GestionUserService.activerUser(req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { client: formatUser(result.user) }, result.message);
});

exports.desactiverClient = asyncHandler(async (req, res) => {
  const result = await GestionUserService.desactiverUser(req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { client: formatUser(result.user) }, result.message);
});

// ── Adresses d'un client (création de commande depuis le dashboard) ─────────
// Même service que le profil mobile : mêmes règles (5 adresses max, adresse
// par défaut unique). L'admin agit pour le compte d'un client existant.
const ProfilService = require('../../services/client/profil.service');

const _clientOu404 = async (id) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new NotFoundError('Client introuvable');
  }
  const result = await GestionUserService.getClientById(id);
  if (!result.success) throw new NotFoundError(result.message);
  return result.user;
};

exports.adressesClient = asyncHandler(async (req, res) => {
  await _clientOu404(req.params.id);
  const result = await ProfilService.getAdresses(req.params.id);
  return ok(res, { adresses: result.adresses }, 'Adresses récupérées');
});

exports.ajouterAdresseClient = asyncHandler(async (req, res) => {
  await _clientOu404(req.params.id);
  const result = await ProfilService.ajouterAdresse(req.params.id, req.body);
  if (!result.success) throw new BadRequestError(result.message);
  return created(res, { adresse: result.adresse }, result.message);
});

exports.getClient = asyncHandler(async (req, res) => {
  const user = await _clientOu404(req.params.id);
  return ok(res, { user: { ...formatUser(user), createdAt: user.createdAt } }, 'Client');
});
