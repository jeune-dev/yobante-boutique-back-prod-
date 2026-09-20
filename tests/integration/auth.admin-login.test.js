/**
 * Contrat HTTP de la connexion réservée au dashboard d'administration :
 * route → validation Joi → contrôleur → service.
 *
 * Un vendeur ou un client avec de bons identifiants doit être refusé en 403
 * (il se connecte depuis l'application mobile) ; un administrateur obtient
 * sa session. Les modèles Sequelize et bcrypt sont doublés.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

jest.mock('bcryptjs');

jest.mock('../../src/models', () => {
  const transaction = { commit: jest.fn(), rollback: jest.fn() };
  return {
    User: { findOne: jest.fn(), findByPk: jest.fn() },
    ProfilVendeur: {},
    Produit: {},
    RefreshToken: { create: jest.fn(), destroy: jest.fn(), update: jest.fn(), findOne: jest.fn() },
    UserOtp: {},
    Adresse: {},
    sequelize: { transaction: jest.fn(async () => transaction) },
  };
});

jest.mock('../../src/services/resend.service', () => ({
  sendEmail: jest.fn(async () => ({ success: true })),
  FROM: 'test',
}));

const { User, RefreshToken, sequelize } = require('../../src/models');
const cache = require('../../src/config/cache');
const app = require('../../src/app');
const { jwtConfig } = require('../../src/config/security');

const compte = (role) => ({
  id: `00000000-0000-4000-8000-00000000000${role === 'ADMIN' ? 1 : 2}`,
  nom: 'Test',
  prenom: role,
  email: `${role.toLowerCase()}@yobante.com`,
  password: '$2a$12$hash',
  role,
  isActive: true,
  isVerified: true,
  mustChangePassword: false,
});

const identifiants = { identifiant: 'x@yobante.com', password: 'Secret123' };

describe('POST /api/v1/auth/admin/login', () => {
  beforeEach(() => {
    // `resetMocks` (jest.config.js) efface les implémentations à chaque test,
    // y compris celles données dans les usines jest.mock : on les repose ici.
    sequelize.transaction.mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() });
    RefreshToken.create.mockResolvedValue({});
    RefreshToken.destroy.mockResolvedValue(0);
    bcrypt.compare.mockResolvedValue(true);
  });

  it('ouvre une session à un ADMIN (token + refreshToken dans le corps)', async () => {
    User.findOne.mockResolvedValue(compte('ADMIN'));

    const res = await request(app).post('/api/v1/auth/admin/login').send(identifiants);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toEqual(expect.any(String));
    // Le dashboard tourne sur une autre origine : il ne peut pas compter sur
    // le cookie HttpOnly, il lui faut le refresh token dans le corps.
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(res.body.data.user.role).toBe('ADMIN');
  });

  it.each(['VENDEUR', 'CLIENT'])('refuse un %s en 403 même avec de bons identifiants', async (role) => {
    User.findOne.mockResolvedValue(compte(role));

    const res = await request(app).post('/api/v1/auth/admin/login').send(identifiants);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/réservé aux administrateurs/i);
    expect(res.body.data).toBeUndefined();
  });

  it('mot de passe faux : 400 générique, sans révéler le rôle', async () => {
    User.findOne.mockResolvedValue(compte('VENDEUR'));
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app).post('/api/v1/auth/admin/login').send(identifiants);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/identifiant ou mot de passe incorrect/i);
  });

  it('le login mobile (/auth/login) accepte toujours un VENDEUR', async () => {
    User.findOne.mockResolvedValue(compte('VENDEUR'));

    const res = await request(app).post('/api/v1/auth/login').send(identifiants);

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('VENDEUR');
  });
});

describe('GET /api/v1/admin/me (vérification de session du dashboard)', () => {
  const jeton = (role) =>
    jwt.sign({ id: compte(role).id, role, isActive: true }, jwtConfig.secret, {
      expiresIn: '1h',
    });

  beforeEach(() => {
    // JWTUtils met le profil en cache 30 s : on repart propre à chaque test.
    cache.clear();
    User.findByPk.mockImplementation(async (id) =>
      [compte('ADMIN'), compte('VENDEUR')].find((u) => u.id === id) || null
    );
  });

  it('renvoie le profil pour un jeton ADMIN', async () => {
    const res = await request(app)
      .get('/api/v1/admin/me')
      .set('Authorization', `Bearer ${jeton('ADMIN')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('ADMIN');
  });

  it('refuse un jeton VENDEUR en 403 (un jeton mobile ne vaut rien sur le dashboard)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/me')
      .set('Authorization', `Bearer ${jeton('VENDEUR')}`);

    expect(res.status).toBe(403);
  });

  it('refuse sans jeton en 401', async () => {
    const res = await request(app).get('/api/v1/admin/me');
    expect(res.status).toBe(401);
  });
});
