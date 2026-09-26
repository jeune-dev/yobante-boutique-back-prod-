/**
 * Valider / rejeter une commande est réservé à l'admin.
 *
 * Les anciennes routes client PATCH /api/v1/commandes/:id/{valider,rejeter}
 * n'avaient que auth + checkActiveUser : n'importe quel CLIENT pouvait valider
 * ou rejeter (et restocker) n'importe quelle commande. Elles sont supprimées ;
 * seules /api/v1/admin/commandes/:id/{valider,rejeter} (adminMiddleware)
 * subsistent.
 *
 *   jeton CLIENT sur la route client → 404, aucune commande lue ni modifiée
 *   jeton CLIENT sur la route admin  → 403, aucune commande lue ni modifiée
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/models', () => {
  const stub = () => ({
    findOne: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(async () => []),
    findAndCountAll: jest.fn(async () => ({ rows: [], count: 0 })), count: jest.fn(async () => 0),
    create: jest.fn(), update: jest.fn(), destroy: jest.fn(), increment: jest.fn(), decrement: jest.fn(),
    sum: jest.fn(async () => 0), max: jest.fn(async () => 0),
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

const { User, Commande, CommandeItem, Produit, sequelize } = require('../../src/models');
const cache = require('../../src/config/cache');
const app = require('../../src/app');
const { jwtConfig } = require('../../src/config/security');

const ID = { CLIENT: '10000000-0000-4000-8000-000000000003', COMMANDE: '20000000-0000-4000-8000-000000000001' };
const COMPTES = { [ID.CLIENT]: { id: ID.CLIENT, role: 'CLIENT', isActive: true, mustChangePassword: false } };
const enClient = () => ({
  Authorization: `Bearer ${jwt.sign({ id: ID.CLIENT, role: 'CLIENT', isActive: true }, jwtConfig.secret, { expiresIn: '1h' })}`,
});

const aucuneCommandeTouchee = () => {
  for (const modele of [Commande, CommandeItem, Produit]) {
    for (const methode of ['findOne', 'findByPk', 'update', 'increment', 'decrement', 'destroy']) {
      expect(modele[methode]).not.toHaveBeenCalled();
    }
  }
  expect(sequelize.transaction).not.toHaveBeenCalled();
};

describe('Valider / rejeter une commande avec un jeton CLIENT', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cache.clear();
    User.findByPk.mockImplementation(async (id) => COMPTES[id] || null);
  });

  describe.each(['valider', 'rejeter'])('%s', (action) => {
    it(`PATCH /api/v1/commandes/:id/${action} → 404 (route supprimée), commande intacte`, async () => {
      const res = await request(app)
        .patch(`/api/v1/commandes/${ID.COMMANDE}/${action}`)
        .set(enClient())
        .send({ motif: 'Rejet par un client' });
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ success: false });
      aucuneCommandeTouchee();
    });

    it(`PATCH /api/v1/admin/commandes/:id/${action} → 403, commande intacte`, async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/commandes/${ID.COMMANDE}/${action}`)
        .set(enClient())
        .send({ motif: 'Rejet par un client' });
      expect(res.status).toBe(403);
      aucuneCommandeTouchee();
    });
  });
});
