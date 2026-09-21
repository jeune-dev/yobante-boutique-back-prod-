/**
 * Protection des endpoints d'administration, toutes méthodes confondues :
 *
 *   sans jeton           → 401
 *   jeton VENDEUR/CLIENT → 403 (même valide, même actif)
 *   jeton ADMIN          → passe le contrôle d'accès (≠ 401/403)
 *   jeton expiré         → 401
 *   compte désactivé     → 403
 *
 * Seule la chaîne auth → motDePasseChange → adminMiddleware est testée : les
 * contrôleurs sont atteints avec des modèles doublés, on ne vérifie que le
 * code de statut du contrôle d'accès, pas le résultat métier.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/models', () => {
  const stub = () => ({
    findOne: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(async () => []),
    findAndCountAll: jest.fn(async () => ({ rows: [], count: 0 })), count: jest.fn(async () => 0),
    create: jest.fn(), update: jest.fn(), destroy: jest.fn(), sum: jest.fn(async () => 0), max: jest.fn(async () => 0),
  });
  const transaction = { commit: jest.fn(), rollback: jest.fn() };
  return {
    User: stub(), ProfilVendeur: stub(), Produit: stub(), Commande: stub(), CommandeItem: stub(),
    Categorie: stub(), Rayon: stub(), SousRayon: stub(), Banniere: stub(), BlocPromo: stub(),
    Promotion: stub(), Avis: stub(), Paiement: stub(), FraisLivraison: stub(), RefreshToken: stub(),
    UserOtp: stub(), Adresse: stub(), Notification: stub(), DeviceToken: stub(), Message: stub(),
    Favori: stub(), Panier: stub(), BanniereProduit: stub(), DemandeSuppressionCompte: stub(),
    sequelize: { transaction: jest.fn(async () => transaction), query: jest.fn(async () => []), literal: jest.fn(), fn: jest.fn(), col: jest.fn(), QueryTypes: { SELECT: 'SELECT' } },
  };
});
jest.mock('../../src/services/resend.service', () => ({ sendEmail: jest.fn(), FROM: 'test' }));

const { User } = require('../../src/models');
const cache = require('../../src/config/cache');
const app = require('../../src/app');
const { jwtConfig } = require('../../src/config/security');

const ID = { ADMIN: '10000000-0000-4000-8000-000000000001', VENDEUR: '10000000-0000-4000-8000-000000000002', CLIENT: '10000000-0000-4000-8000-000000000003', INACTIF: '10000000-0000-4000-8000-000000000004' };
const COMPTES = {
  [ID.ADMIN]: { id: ID.ADMIN, role: 'ADMIN', isActive: true, mustChangePassword: false },
  [ID.VENDEUR]: { id: ID.VENDEUR, role: 'VENDEUR', isActive: true, mustChangePassword: false },
  [ID.CLIENT]: { id: ID.CLIENT, role: 'CLIENT', isActive: true, mustChangePassword: false },
  [ID.INACTIF]: { id: ID.INACTIF, role: 'ADMIN', isActive: false, mustChangePassword: false },
};
const jeton = (id, role, opts = {}) =>
  jwt.sign({ id, role, isActive: true }, jwtConfig.secret, { expiresIn: opts.expire ? '-10s' : '1h' });

// Un échantillon représentatif de chaque famille de routes admin, sur les
// quatre méthodes HTTP utilisées par le dashboard.
const ENDPOINTS = [
  ['get', '/api/v1/admin/me'],
  ['get', '/api/v1/admin/dashboard/kpi-complet'],
  ['get', '/api/v1/admin/produits'],
  ['post', '/api/v1/admin/produits'],
  ['put', `/api/v1/admin/produits/${ID.ADMIN}`],
  ['delete', `/api/v1/admin/produits/${ID.ADMIN}`],
  ['patch', `/api/v1/admin/produits/${ID.ADMIN}/visibilite`],
  ['get', '/api/v1/admin/commandes'],
  ['patch', `/api/v1/admin/commandes/${ID.ADMIN}/valider`],
  ['get', '/api/v1/admin/users/clients'],
  ['patch', `/api/v1/admin/users/clients/${ID.CLIENT}/desactiver`],
  ['get', '/api/v1/admin/vendeurs'],
  ['post', '/api/v1/admin/vendeurs'],
  ['patch', `/api/v1/admin/vendeurs/${ID.VENDEUR}/bloquer`],
  ['get', '/api/v1/admin/avis'],
  ['delete', `/api/v1/admin/avis/${ID.ADMIN}`],
  ['get', '/api/v1/admin/paiements'],
  ['get', '/api/v1/admin/rayons'],
  ['post', '/api/v1/admin/rayons'],
  ['get', '/api/v1/admin/bannieres'],
  ['get', '/api/v1/admin/promotions'],
  ['get', '/api/v1/admin/blocs-promo'],
  ['get', '/api/v1/admin/signalements'],
  ['patch', `/api/v1/admin/signalements/${ID.ADMIN}`],
];

describe('Protection des endpoints /api/v1/admin/*', () => {
  beforeEach(() => {
    cache.clear();
    User.findByPk.mockImplementation(async (id) => COMPTES[id] || null);
  });

  describe.each(ENDPOINTS)('%s %s', (methode, url) => {
    it('sans jeton → 401', async () => {
      const res = await request(app)[methode](url);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ success: false });
    });

    it('jeton VENDEUR → 403', async () => {
      const res = await request(app)[methode](url).set('Authorization', `Bearer ${jeton(ID.VENDEUR, 'VENDEUR')}`);
      expect(res.status).toBe(403);
    });

    it('jeton CLIENT → 403', async () => {
      const res = await request(app)[methode](url).set('Authorization', `Bearer ${jeton(ID.CLIENT, 'CLIENT')}`);
      expect(res.status).toBe(403);
    });

    it('jeton ADMIN → passe le contrôle d’accès', async () => {
      const res = await request(app)[methode](url).set('Authorization', `Bearer ${jeton(ID.ADMIN, 'ADMIN')}`);
      expect([401, 403]).not.toContain(res.status);
    });
  });

  it('jeton expiré → 401 « Token expiré »', async () => {
    const res = await request(app).get('/api/v1/admin/me').set('Authorization', `Bearer ${jeton(ID.ADMIN, 'ADMIN', { expire: true })}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expiré/i);
  });

  it('jeton signé avec une autre clé → 401', async () => {
    const faux = jwt.sign({ id: ID.ADMIN, role: 'ADMIN', isActive: true }, 'mauvaise-cle', { expiresIn: '1h' });
    const res = await request(app).get('/api/v1/admin/me').set('Authorization', `Bearer ${faux}`);
    expect(res.status).toBe(401);
  });

  it('jeton ADMIN d’un compte désactivé → 403 (revérifié en base, pas seulement dans le jeton)', async () => {
    const res = await request(app).get('/api/v1/admin/me').set('Authorization', `Bearer ${jeton(ID.INACTIF, 'ADMIN')}`);
    expect(res.status).toBe(403);
  });

  it('un jeton dont le rôle prétend ADMIN mais dont le compte est VENDEUR en base → 403', async () => {
    // Le rôle porté par le jeton ne suffit pas : la base fait foi.
    const res = await request(app).get('/api/v1/admin/me').set('Authorization', `Bearer ${jeton(ID.VENDEUR, 'ADMIN')}`);
    expect(res.status).toBe(403);
  });

  it('les erreurs ne divulguent ni pile ni détail interne', async () => {
    const res = await request(app).get('/api/v1/admin/me');
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js:\d+|stack|sequelize/i);
  });
});
