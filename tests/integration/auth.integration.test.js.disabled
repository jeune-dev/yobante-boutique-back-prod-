// tests/integration/auth.integration.test.js

const request = require('supertest');
const express = require('express');
const userFixture = require('../fixtures/user.fixture');

// Mock les services et utils AVANT d'importer les routes
jest.mock('../../src/config/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

// Le rate limiter partage un compteur en mémoire entre tous les tests de ce fichier ;
// on le neutralise pour que les assertions portent sur la logique métier, pas sur le quota.
jest.mock('../../src/middlewares/rateLimit.middleware', () => ({
  authLimiter: (req, res, next) => next(),
  registerLimiter: (req, res, next) => next(),
  forgotPasswordLimiter: (req, res, next) => next(),
  globalLimiter: (req, res, next) => next(),
}));

// Mock AuthService
const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn()
};

jest.mock('../../src/services/auth.service', () => mockAuthService);

// Après les mocks, import les routes
const app = express();
app.use(express.json());
app.use('/api/auth', require('../../src/routes/auth.routes'));
// Gestionnaire d'erreurs global : convertit les erreurs (ex. validation Joi
// propagée par validate → next(err)) en réponses HTTP uniformes (400, etc.).
app.use(require('../../src/middlewares/error.middleware'));

describe('Auth Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('devrait enregistrer un nouvel utilisateur avec succès', async () => {
      const { registerData } = userFixture;
      const responseUser = {
        id: 'user-id',
        ...registerData,
        role: 'CLIENT'
      };

      mockAuthService.register.mockResolvedValue({
        success: true,
        message: 'Inscription réussie',
        user: responseUser
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send(registerData);

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Inscription réussie');
      expect(res.body.data.user).toBeDefined();
    });

    it('devrait retourner 400 si l\'email existe déjà', async () => {
      const { registerData } = userFixture;

      mockAuthService.register.mockResolvedValue({
        success: false,
        message: 'Cet email est déjà utilisé'
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send(registerData);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Cet email est déjà utilisé');
    });

    it('devrait retourner 500 en cas d\'erreur serveur', async () => {
      const { registerData } = userFixture;

      mockAuthService.register.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .post('/api/auth/register')
        .send(registerData);

      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/auth/login', () => {
    it('devrait connecter un utilisateur avec identifiant et mot de passe valides', async () => {
      const loginData = {
        identifiant: userFixture.validUser.email,
        password: 'password123'
      };

      mockAuthService.login.mockResolvedValue({
        success: true,
        token: 'access-token',
        refreshToken: 'refresh-token',
        user: userFixture.validUser
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      expect(res.status).toBe(200);
      expect(res.body.data.token).toBe('access-token');
      expect(res.body.data.user).toBeDefined();
      // Le refresh token n'est plus renvoyé dans le corps : il part en cookie
      // HttpOnly, donc inaccessible au JavaScript de la page.
      expect(res.body.data.refreshToken).toBeUndefined();
      const cookies = res.headers['set-cookie'] || [];
      expect(cookies.some((c) => c.startsWith('refresh_token=refresh-token'))).toBe(true);
      expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);
    });

    it('devrait retourner 400 si identifiant manquant', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'password123' });

      expect(res.status).toBe(400);
    });

    it('devrait retourner 400 si mot de passe manquant', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identifiant: userFixture.validUser.email });

      expect(res.status).toBe(400);
    });

    it('devrait retourner 400 avec mot de passe incorrect', async () => {
      const loginData = {
        identifiant: userFixture.validUser.email,
        password: 'wrongpassword'
      };

      mockAuthService.login.mockResolvedValue({
        success: false,
        error: 'Identifiant ou mot de passe incorrect'
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('devrait générer un nouveau token avec un refresh token valide', async () => {
      const refreshToken = 'valid-refresh-token';

      mockAuthService.refresh.mockResolvedValue({
        success: true,
        token: 'new-access-token',
        refreshToken: 'new-refresh-token'
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data.token).toBe('new-access-token');
    });

    it('devrait retourner 400 si refreshToken manquant', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
    });

    it('devrait retourner 401 avec un refresh token invalide', async () => {
      mockAuthService.refresh.mockResolvedValue({
        success: false,
        error: 'Refresh token invalide'
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('devrait déconnecter un utilisateur', async () => {
      const refreshToken = 'valid-refresh-token';

      mockAuthService.logout.mockResolvedValue({});

      const res = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Déconnexion réussie');
    });

    it('devrait gérer un refresh token manquant', async () => {
      mockAuthService.logout.mockResolvedValue({});

      const res = await request(app)
        .post('/api/auth/logout')
        .send({});

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('devrait envoyer un email de réinitialisation', async () => {
      const email = userFixture.validUser.email;

      mockAuthService.forgotPassword.mockResolvedValue({
        message: 'Email de réinitialisation envoyé'
      });

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Email');
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('devrait réinitialiser le mot de passe avec un OTP valide', async () => {
      const data = {
        email: userFixture.validUser.email,
        otp: 'VALID123',
        newPassword: 'NewPassword456'
      };

      mockAuthService.resetPassword.mockResolvedValue({
        success: true,
        message: 'Mot de passe réinitialisé'
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send(data);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Mot de passe');
    });

    it('devrait rejeter un OTP invalide', async () => {
      const data = {
        email: userFixture.validUser.email,
        otp: 'INVALID',
        newPassword: 'NewPassword456'
      };

      mockAuthService.resetPassword.mockResolvedValue({
        success: false,
        message: 'OTP invalide'
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send(data);

      expect(res.status).toBe(400);
    });
  });
});
