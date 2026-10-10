/**
 * Chaîne complète de la gestion des vendeurs côté admin :
 * route → validation Joi → middleware admin → contrôleur → service.
 *
 * Les modèles Sequelize sont doublés : le test vérifie la logique métier et le
 * contrat HTTP, pas le pilote PostgreSQL. Les écritures attendues en base sont
 * contrôlées via les appels reçus par les doublures.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

// ── Doublures ────────────────────────────────────────────────
jest.mock('../../src/models', () => {
  const transaction = { commit: jest.fn(), rollback: jest.fn() };
  return {
    User: {
      findOne: jest.fn(),
      findByPk: jest.fn(),
      findAndCountAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    ProfilVendeur: { create: jest.fn(), update: jest.fn(), findOne: jest.fn() },
    Produit: {},
    RefreshToken: { create: jest.fn(), destroy: jest.fn(), update: jest.fn(), findOne: jest.fn() },
    UserOtp: {},
    Adresse: {},
    sequelize: { transaction: jest.fn(async () => transaction), __transaction: transaction },
  };
});

jest.mock('../../src/services/resend.service', () => ({
  sendEmail: jest.fn(async () => ({ success: true, id: 'msg_test' })),
  FROM: 'test',
}));

const { User, ProfilVendeur, sequelize } = require('../../src/models');
const { sendEmail } = require('../../src/services/resend.service');
const cache = require('../../src/config/cache');
const app = require('../../src/app');
const { jwtConfig } = require('../../src/config/security');

const ID_ADMIN = '11111111-1111-4111-8111-111111111111';
const ID_VENDEUR = '22222222-2222-4222-8222-222222222222';

const tokenAdmin = () =>
  jwt.sign({ id: ID_ADMIN, role: 'ADMIN', isActive: true }, jwtConfig.secret, {
    expiresIn: '1h',
  });

/** L'admin authentifié, résolu par JWTUtils.verifyAndCache via User.findByPk. */
const adminAuthentifie = (mustChangePassword = false) =>
  User.findByPk.mockResolvedValue({
    id: ID_ADMIN,
    role: 'ADMIN',
    isActive: true,
    mustChangePassword,
  });

const profilFactice = (surcharges = {}) => ({
  id: 'p1',
  userId: ID_VENDEUR,
  nomBoutique: 'Chez Lala',
  adresseBoutique: 'Dakar, Plateau',
  description: null,
  infoLegale: null,
  telephone: '0761050794',
  logo: null,
  latitude: null,
  longitude: null,
  ...surcharges,
  toJSON() {
    const { toJSON, ...reste } = this;
    return reste;
  },
});

// `resetMocks: true` (jest.config.js) efface les implementations posées dans la
// fabrique de `jest.mock` : on les repose avant chaque test.
beforeEach(() => {
  jest.clearAllMocks();
  cache.clear();
  sequelize.transaction.mockResolvedValue(sequelize.__transaction);
  sequelize.__transaction.commit.mockResolvedValue(undefined);
  sequelize.__transaction.rollback.mockResolvedValue(undefined);
  sendEmail.mockResolvedValue({ success: true, id: 'msg_test' });
});

describe('POST /api/v1/admin/vendeurs — création', () => {
  const corpsValide = {
    nom: 'Dia',
    prenom: 'Lala',
    email: '  LALA@Example.COM ',
    telephone: '0761050794',
    nomBoutique: 'Chez Lala',
    adresseBoutique: 'Dakar, Plateau',
    password: 'Boutique2026',
  };

  it('crée un vendeur ACTIF avec le mot de passe choisi, et l’envoie par email', async () => {
    adminAuthentifie();
    // 1er findOne : unicité de l'email (aucun compte existant)
    User.findOne.mockResolvedValueOnce(null);
    User.create.mockImplementation(async (donnees) => ({
      ...donnees,
      id: ID_VENDEUR,
      toJSON: () => ({ ...donnees, id: ID_VENDEUR }),
    }));
    ProfilVendeur.create.mockImplementation(async (donnees) => profilFactice(donnees));

    const res = await request(app)
      .post('/api/v1/admin/vendeurs')
      .set('Authorization', `Bearer ${tokenAdmin()}`)
      .send(corpsValide);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // ── Base de données ──
    const userCree = User.create.mock.calls[0][0];
    expect(userCree.role).toBe('VENDEUR');
    expect(userCree.isActive).toBe(true); // actif immédiatement
    // Mot de passe choisi par l'administrateur : pas de changement imposé.
    expect(userCree.mustChangePassword).toBe(false);
    expect(userCree.email).toBe('lala@example.com'); // normalisé
    expect(userCree.password).toMatch(/^\$2[aby]\$/); // hash bcrypt, jamais en clair
    expect(userCree.password).not.toContain('Boutique2026');

    const profilCree = ProfilVendeur.create.mock.calls[0][0];
    expect(profilCree.nomBoutique).toBe('Chez Lala');
    expect(profilCree.isActive).toBe(true);

    // ── Email Resend ──
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const email = sendEmail.mock.calls[0][0];
    expect(email.to).toBe('lala@example.com');
    expect(email.html).toContain('lala@example.com');
    expect(email.html).toContain('Boutique2026'); // identifiant + mot de passe transmis
    expect(email.html).toMatch(/application mobile/i); // connexion depuis l'app, pas le dashboard

    // ── Réponse HTTP ──
    expect(res.body.data.vendeur.statut).toBe('actif');
    expect(res.body.data.vendeur.isBlocked).toBe(false);
    expect(res.body.data.vendeur.nomBoutique).toBe('Chez Lala');
    expect(res.body.data.vendeur.password).toBeUndefined();
    expect(res.body.data.emailEnvoye).toBe(true);
  });

  it('refuse un corps incomplet (validation Joi) sans toucher à la base', async () => {
    adminAuthentifie();

    const res = await request(app)
      .post('/api/v1/admin/vendeurs')
      .set('Authorization', `Bearer ${tokenAdmin()}`)
      .send({ nom: 'Dia', prenom: 'Lala' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(User.create).not.toHaveBeenCalled();
  });

  it.each([
    ['absent', undefined],
    ['trop court', 'Ab1'],
    ['sans majuscule', 'boutique2026'],
    ['sans chiffre', 'BoutiqueYobante'],
  ])('refuse un mot de passe %s sans toucher à la base', async (_cas, password) => {
    adminAuthentifie();

    const res = await request(app)
      .post('/api/v1/admin/vendeurs')
      .set('Authorization', `Bearer ${tokenAdmin()}`)
      .send({ ...corpsValide, password });

    expect(res.status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('rejette un email déjà utilisé', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce({ id: 'autre' });

    const res = await request(app)
      .post('/api/v1/admin/vendeurs')
      .set('Authorization', `Bearer ${tokenAdmin()}`)
      .send(corpsValide);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/déjà utilisé/i);
    expect(User.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/admin/vendeurs — informations boutique', () => {
  it('remonte le nom et l’adresse de la boutique à plat et sous `boutique`', async () => {
    adminAuthentifie();
    User.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [
        {
          toJSON: () => ({
            id: ID_VENDEUR,
            nom: 'Dia',
            prenom: 'Lala',
            email: 'lala@example.com',
            telephone: '0761050794',
            isActive: true,
            profilVendeur: profilFactice().toJSON(),
          }),
        },
      ],
    });

    const res = await request(app)
      .get('/api/v1/admin/vendeurs')
      .set('Authorization', `Bearer ${tokenAdmin()}`);

    expect(res.status).toBe(200);
    const vendeur = res.body.data.vendeurs[0];
    expect(vendeur.nomBoutique).toBe('Chez Lala');
    expect(vendeur.adresseBoutique).toBe('Dakar, Plateau');
    expect(vendeur.boutique.nom).toBe('Chez Lala');
    expect(vendeur.boutique.adresse).toBe('Dakar, Plateau');
    expect(vendeur.statut).toBe('actif');
  });
});

describe('Blocage / déblocage', () => {
  it('bloque un vendeur actif et met isActive à false en base', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce({ id: ID_VENDEUR, isActive: true });
    User.update.mockResolvedValueOnce([1]);
    ProfilVendeur.update.mockResolvedValueOnce([1]);

    const res = await request(app)
      .patch(`/api/v1/admin/vendeurs/${ID_VENDEUR}/bloquer`)
      .set('Authorization', `Bearer ${tokenAdmin()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.statut).toBe('bloque');
    expect(res.body.data.isBlocked).toBe(true);
    expect(User.update.mock.calls[0][0]).toEqual({ isActive: false });
    expect(ProfilVendeur.update.mock.calls[0][0]).toEqual({ isActive: false });
  });

  it('débloque un vendeur bloqué et repasse isActive à true', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce({ id: ID_VENDEUR, isActive: false });
    User.update.mockResolvedValueOnce([1]);
    ProfilVendeur.update.mockResolvedValueOnce([1]);

    const res = await request(app)
      .patch(`/api/v1/admin/vendeurs/${ID_VENDEUR}/debloquer`)
      .set('Authorization', `Bearer ${tokenAdmin()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.statut).toBe('actif');
    expect(res.body.data.isBlocked).toBe(false);
    expect(User.update.mock.calls[0][0]).toEqual({ isActive: true });
  });

  it('signale un double blocage concurrent au lieu d’un faux succès', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce({ id: ID_VENDEUR, isActive: true });
    User.update.mockResolvedValueOnce([0]); // un autre admin a bloqué entre-temps

    const res = await request(app)
      .patch(`/api/v1/admin/vendeurs/${ID_VENDEUR}/bloquer`)
      .set('Authorization', `Bearer ${tokenAdmin()}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/déjà bloqué/i);
    expect(sequelize.__transaction.rollback).toHaveBeenCalled();
  });

  it('renvoie le statut courant lu en base', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce({ id: ID_VENDEUR, isActive: false });

    const res = await request(app)
      .get(`/api/v1/admin/vendeurs/${ID_VENDEUR}/statut`)
      .set('Authorization', `Bearer ${tokenAdmin()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ statut: 'bloque', isBlocked: true });
  });

  it('404 si le vendeur n’existe pas', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .get(`/api/v1/admin/vendeurs/${ID_VENDEUR}/statut`)
      .set('Authorization', `Bearer ${tokenAdmin()}`);

    expect(res.status).toBe(404);
  });
});

describe('Obligation de changer le mot de passe temporaire', () => {
  it('refuse toute route métier tant que le mot de passe n’est pas changé', async () => {
    adminAuthentifie(true);

    const res = await request(app)
      .get('/api/v1/admin/vendeurs')
      .set('Authorization', `Bearer ${tokenAdmin()}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MOT_DE_PASSE_A_CHANGER');
    expect(res.body.mustChangePassword).toBe(true);
    expect(User.findAndCountAll).not.toHaveBeenCalled();
  });

  it('laisse passer une fois le mot de passe changé', async () => {
    adminAuthentifie(false);
    User.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

    const res = await request(app)
      .get('/api/v1/admin/vendeurs')
      .set('Authorization', `Bearer ${tokenAdmin()}`);

    expect(res.status).toBe(200);
  });

  it('n’empêche pas d’atteindre les routes /auth (le changement reste possible)', async () => {
    // Aucun token : la route existe et répond en 400/401, jamais en 403 « mot
    // de passe à changer » — c'est la porte de sortie du compte bloqué.
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.body.code).not.toBe('MOT_DE_PASSE_A_CHANGER');
  });
});
