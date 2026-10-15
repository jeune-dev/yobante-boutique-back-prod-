// tests/unit/services/promotionDuMoment.test.js
// « Nos promos du moment » : une vraie promotion, avec remise calculée
// automatiquement et date de fin obligatoire.

const mockProduit = { id: 'p1', prix: '20000.00' };
const mockCreate = jest.fn();
const mockPromo = { section: 'nos_promos_du_moment', prixPromo: '15000.00', dateDebut: null, dateFin: null };
mockPromo.update = jest.fn();

jest.mock('../../../src/models', () => ({
  Promotion: {
    create: (...a) => mockCreate(...a),
    // Aucune autre promotion sur ce produit.
    findAll: () => Promise.resolve([]),
    findByPk: () => Promise.resolve({ ...mockPromo, produit: mockProduit, update: mockPromo.update }),
  },
  Produit: { findByPk: () => Promise.resolve(mockProduit) },
  Categorie: {},
  BlocPromo: {},
}));

const Service = require('../../../src/services/admin/promotion.service');

const demain = () => new Date(Date.now() + 86400000).toISOString();
const hier = () => new Date(Date.now() - 86400000).toISOString();

// La configuration jest réinitialise les mocks entre deux tests.
beforeEach(() => {
  mockCreate.mockImplementation((d) => Promise.resolve({ id: 'promo1', ...d }));
  mockPromo.update.mockImplementation((d) => Promise.resolve(d));
});

describe('calcul de la remise', () => {
  test('remise en % → prix promo calculé', () => {
    const d = Service._completerRemise({ pourcentageReduction: 25 }, mockProduit);
    expect(d.prixPromo).toBe(15000);
    expect(d.pourcentageReduction).toBe(25);
  });
  test('prix promo → remise en % calculée', () => {
    const d = Service._completerRemise({ prixPromo: 18000 }, mockProduit);
    expect(d.pourcentageReduction).toBe(10);
  });
  test('arrondi au franc', () => {
    const d = Service._completerRemise({ pourcentageReduction: 33 }, { prix: '999' });
    expect(d.prixPromo).toBe(669);
  });
});

describe('création dans « Nos promos du moment »', () => {
  test('refusée sans remise', async () => {
    const r = await Service.create({ produitId: 'p1', section: 'nos_promos_du_moment', dateFin: demain() });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/remise/);
    expect(mockCreate).not.toHaveBeenCalled();
  });
  test('refusée sans date de fin, ou avec une date passée', async () => {
    const base = { produitId: 'p1', section: 'nos_promos_du_moment', pourcentageReduction: 20 };
    expect((await Service.create(base)).message).toMatch(/date de fin/);
    expect((await Service.create({ ...base, dateFin: hier() })).message).toMatch(/futur/);
  });
  test('acceptée : prix promo enregistré', async () => {
    const r = await Service.create({
      produitId: 'p1', section: 'nos_promos_du_moment', pourcentageReduction: 20, dateFin: demain(),
    });
    expect(r.success).toBe(true);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ prixPromo: 16000, pourcentageReduction: 20 });
  });
  test('les autres sections gardent leurs règles', async () => {
    const r = await Service.create({ produitId: 'p1', section: 'a_ne_pas_rater' });
    expect(r.success).toBe(true);
  });
});

test('modification de la remise seule : prix promo recalculé', async () => {
  const r = await Service.update('promo1', { pourcentageReduction: 50, dateFin: demain() });
  expect(r.success).toBe(true);
  expect(mockPromo.update.mock.calls[0][0]).toMatchObject({ prixPromo: 10000, pourcentageReduction: 50 });
});
