/**
 * La catégorie a été retirée du formulaire produit : le classement se fait
 * uniquement par rayon puis sous-rayon.
 *
 * Ce test verrouille le nouveau contrat côté admin : création et modification
 * réussissent sans `categorieId`, et un `categorieId` résiduel envoyé par un
 * ancien client n'est jamais écrit en base.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/models', () => ({
  Produit: { create: jest.fn(), findByPk: jest.fn(), findAndCountAll: jest.fn(), update: jest.fn() },
  User: { findByPk: jest.fn(), findOne: jest.fn() },
  Rayon: { findByPk: jest.fn() },
  SousRayon: { findByPk: jest.fn() },
  ProfilVendeur: {},
  RefreshToken: {},
  UserOtp: {},
  Adresse: {},
  sequelize: { transaction: jest.fn() },
}));

jest.mock('../../src/utils/slugify', () => ({
  generateUniqueSlug: jest.fn(async () => 'produit-test'),
  createWithUniqueSlug: jest.fn(),
}));

const { Produit, User, Rayon, SousRayon } = require('../../src/models');
const { generateUniqueSlug } = require('../../src/utils/slugify');
const cache = require('../../src/config/cache');
const app = require('../../src/app');
const { jwtConfig } = require('../../src/config/security');

const ID_ADMIN = '11111111-1111-4111-8111-111111111111';
const ID_RAYON = '33333333-3333-4333-8333-333333333333';
const ID_SOUS_RAYON = '44444444-4444-4444-8444-444444444444';
const ID_PRODUIT = '55555555-5555-4555-8555-555555555555';

const tokenAdmin = () =>
  jwt.sign({ id: ID_ADMIN, role: 'ADMIN', isActive: true }, jwtConfig.secret, { expiresIn: '1h' });

beforeEach(() => {
  jest.clearAllMocks();
  cache.clear();
  // `resetMocks: true` efface les implémentations posées dans les fabriques.
  generateUniqueSlug.mockResolvedValue('produit-test');
  User.findByPk.mockResolvedValue({
    id: ID_ADMIN,
    role: 'ADMIN',
    isActive: true,
    mustChangePassword: false,
  });
  Rayon.findByPk.mockResolvedValue({ id: ID_RAYON });
  SousRayon.findByPk.mockResolvedValue({ id: ID_SOUS_RAYON, rayonId: ID_RAYON });
});

describe('POST /api/v1/admin/produits', () => {
  it('crée un produit sans catégorie, rangé par rayon et sous-rayon', async () => {
    Produit.create.mockImplementation(async (d) => ({ ...d, id: ID_PRODUIT }));

    const res = await request(app)
      .post('/api/v1/admin/produits')
      .set('Authorization', `Bearer ${tokenAdmin()}`)
      .field('nom', 'Sac en cuir')
      .field('prix', '15000')
      .field('stock', '4')
      .field('rayonId', ID_RAYON)
      .field('sousRayonId', ID_SOUS_RAYON);

    expect(res.status).toBe(201);
    const cree = Produit.create.mock.calls[0][0];
    expect(cree.rayonId).toBe(ID_RAYON);
    expect(cree.sousRayonId).toBe(ID_SOUS_RAYON);
    expect(cree.categorieId).toBeUndefined();
  });

  it('ignore un categorieId résiduel envoyé par un ancien client', async () => {
    Produit.create.mockImplementation(async (d) => ({ ...d, id: ID_PRODUIT }));

    const res = await request(app)
      .post('/api/v1/admin/produits')
      .set('Authorization', `Bearer ${tokenAdmin()}`)
      .field('nom', 'Sac en cuir')
      .field('prix', '15000')
      .field('rayonId', ID_RAYON)
      .field('sousRayonId', ID_SOUS_RAYON)
      .field('categorieId', '66666666-6666-4666-8666-666666666666');

    expect(res.status).toBe(201);
    expect(Produit.create.mock.calls[0][0].categorieId).toBeUndefined();
  });

  it('exige toujours le rayon et le sous-rayon', async () => {
    const res = await request(app)
      .post('/api/v1/admin/produits')
      .set('Authorization', `Bearer ${tokenAdmin()}`)
      .field('nom', 'Sac en cuir')
      .field('prix', '15000');

    expect(res.status).toBe(400);
    expect(Produit.create).not.toHaveBeenCalled();
  });

  it('refuse un sous-rayon étranger au rayon choisi', async () => {
    SousRayon.findByPk.mockResolvedValue({ id: ID_SOUS_RAYON, rayonId: 'un-autre-rayon' });

    const res = await request(app)
      .post('/api/v1/admin/produits')
      .set('Authorization', `Bearer ${tokenAdmin()}`)
      .field('nom', 'Sac en cuir')
      .field('prix', '15000')
      .field('rayonId', ID_RAYON)
      .field('sousRayonId', ID_SOUS_RAYON);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/sous-rayon/i);
    expect(Produit.create).not.toHaveBeenCalled();
  });
});

describe('PUT /api/v1/admin/produits/:id', () => {
  it('modifie un produit sans exiger ni écrire de catégorie', async () => {
    const update = jest.fn(async () => undefined);
    Produit.findByPk.mockResolvedValue({
      id: ID_PRODUIT,
      nom: 'Sac en cuir',
      rayonId: ID_RAYON,
      sousRayonId: ID_SOUS_RAYON,
      images: [],
      update,
    });

    const res = await request(app)
      .put(`/api/v1/admin/produits/${ID_PRODUIT}`)
      .set('Authorization', `Bearer ${tokenAdmin()}`)
      .field('nom', 'Sac en cuir premium')
      .field('prix', '17000');

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalled();
    expect(update.mock.calls[0][0].categorieId).toBeUndefined();
  });
});
