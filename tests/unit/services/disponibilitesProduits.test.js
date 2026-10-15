// tests/unit/services/disponibilitesProduits.test.js
// Stock actuel des produits du panier : sert au mobile à signaler les
// ruptures et à bloquer la commande avant l'envoi.

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const mockFindAll = jest.fn();
jest.mock('../../../src/models', () => ({
  Produit: { findAll: (...a) => mockFindAll(...a) },
  Categorie: {},
  Avis: {},
  User: {},
  ProfilVendeur: {},
}));

const ProduitService = require('../../../src/services/client/produit.service');

beforeEach(() => jest.clearAllMocks());

test('stock, rupture et produit retiré de la vente', async () => {
  mockFindAll.mockResolvedValue([
    { id: A, stock: 4 },
    { id: B, stock: 0 },
  ]);
  const r = await ProduitService.getDisponibilites([A, B, C]);
  expect(r.disponibilites).toEqual([
    { id: A, disponible: true, stock: 4, enRupture: false },
    { id: B, disponible: true, stock: 0, enRupture: true },
    { id: C, disponible: false, stock: 0, enRupture: true },
  ]);
  // Seuls les produits visibles du public comptent.
  expect(mockFindAll.mock.calls[0][0].where).toMatchObject({ id: [A, B, C], isActive: true });
});

test('identifiants invalides ignorés, aucune requête inutile', async () => {
  const r = await ProduitService.getDisponibilites(['abc', "1' OR 1=1", '']);
  expect(r.disponibilites).toEqual([]);
  expect(mockFindAll).not.toHaveBeenCalled();
});
