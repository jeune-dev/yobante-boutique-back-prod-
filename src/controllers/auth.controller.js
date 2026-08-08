/**
 * Auth Controller
 * Gère l'authentification et la gestion de compte
 */
const AuthService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { BadRequestError, UnauthorizedError } = require('../errors/AppError');
const formatUser = require('../utils/formatUser');

const isProd = process.env.NODE_ENV === 'production';

const REFRESH_COOKIE = 'refresh_token';
const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
  path: '/api/v1/auth',
};

/**
 * POST /api/auth/register
 * Créer un nouveau compte utilisateur
 */
exports.register = asyncHandler(async (req, res) => {
  const { nom, prenom, email, password, telephone, adresse } = req.body;

  const result = await AuthService.register({ nom, prenom, email, password, telephone, adresse });

  if (!result.success) throw new BadRequestError(result.message);

  // Garde défensive : ne jamais appeler formatUser(undefined) — c'était la
  // cause du 500 « Cannot read properties of undefined (reading 'id') » quand
  // le service ne renvoyait pas d'utilisateur.
  const data = result.user ? { user: formatUser(result.user) } : {};
  // Auto-connexion : l'inscription renvoie aussi les tokens, comme le login.
  if (result.token) data.token = result.token;
  if (result.refreshToken) data.refreshToken = result.refreshToken;
  return created(res, data, result.message);
});

/**
 * POST /api/auth/login
 * Connexion avec email et mot de passe
 */
exports.login = asyncHandler(async (req, res) => {
  const { identifiant, password } = req.body;

  // Validation spécifique
  if (!identifiant) throw new BadRequestError('Email ou téléphone requis');
  if (!password) throw new BadRequestError('Mot de passe requis');

  const result = await AuthService.login({ identifiant, password });

  if (!result.success) throw new BadRequestError(result.error || result.message);

  // Refresh token → cookie HttpOnly (inaccessible à JS)
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);

  return ok(
    res,
    {
      token: result.token,
      user: formatUser(result.user),
      mustChangePassword: result.mustChangePassword,
    },
    result.message
  );
});

/**
 * POST /api/auth/refresh
 * Renouveler le token d'accès avec un refresh token
 */
exports.refresh = asyncHandler(async (req, res) => {
  // Lire depuis le cookie HttpOnly (priorité) ou le body (rétrocompat temporaire)
  const refreshToken = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;

  if (!refreshToken) throw new UnauthorizedError('Session expirée. Veuillez vous reconnecter.');

  const result = await AuthService.refresh({ refreshToken });

  if (!result.success) {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    throw new UnauthorizedError(result.error);
  }

  // Rotation du refresh token → nouveau cookie HttpOnly
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);

  return ok(res, { token: result.token }, 'Token renouvelé');
});

/**
 * POST /api/auth/logout
 * Déconnexion et revocation du refresh token
 */
exports.logout = asyncHandler(async (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;

    await AuthService.logout({ refreshToken });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return ok(res, {}, 'Déconnexion réussie');
  } catch (error) {
    throw new BadRequestError('Erreur lors de la déconnexion');
  }
});

/**
 * POST /api/auth/forgot-password
 * Demander un reset de mot de passe (envoi OTP par email)
 */
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const result = await AuthService.forgotPassword(email);
  return ok(res, {}, result.message);
});

/**
 * POST /api/auth/reset-password
 * Réinitialiser le mot de passe avec OTP
 */
exports.resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  const result = await AuthService.resetPassword(email, otp, newPassword);

  if (!result.success) throw new BadRequestError(result.message);

  return ok(res, {}, result.message);
});

/**
 * POST /api/auth/change-password (protégé)
 * Changer le mot de passe (utilisateur authentifié)
 */
exports.changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const result = await AuthService.changePassword(req.user.id, oldPassword, newPassword);

  if (!result.success) throw new BadRequestError(result.message);

  return ok(res, {}, result.message);
});

/**
 * POST /api/auth/changer-premier-mdp (protégé)
 * Changer le mot de passe temporaire lors du premier login
 */
exports.changerPremierMotDePasse = asyncHandler(async (req, res) => {
  const result = await AuthService.changerPremierMotDePasse(req.user.id, req.body);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, {}, result.message);
});
