// tests/unit/services/promotionRemiseUnique.test.js
// Un produit peut être dans plusieurs sections, mais avec une seule remise :
// deux promotions qui se chevauchent doivent avoir le même prix promo.

const jour = (n) => new Date(Date.now() + n * 86400000).toISOString();
const mockProduit = { id: 'p1', nom: 'Riz 25 kg', prix: '20000.00' };
const mockCreate = jest.fn();
const mockFindAll = jest.fn();
const mockAutreUpdate = jest.fn();
const mockPromoUpdate = jest.fn();

jest.mock('../../../src/models', () => ({
  Promotion: {
    create: (...a) => mockCreate(...a),
    findAll: (...a) => mockFindAll(...a),
    findByPk: () =>
      Promise.resolve({
        id: 'moi', produitId: 'p1', section: 'a_ne_pas_rater', prixPromo: '15000.00',
        pourcentageReduction: '25.00', dateDebut: null, dateFin: null,
        produit: mockProduit, update: mockPromoUpdate,
      }),
  },
  Produit: { findByPk: () => Promise.resolve(mockProduit) },
  Categorie: {},
  BlocPromo: {},
}));

const Service = require('../../../src/services/admin/promotion.service');

// Promotion existante : « Nos promos du moment », −25 % (15 000 FCFA).
const existante = (extra = {}) => ({
  id: 'x1', produitId: 'p1', section: 'nos_promos_du_moment', prixPromo: '15000.00',
  pourcentageReduction: '25.00', dateDebut: jour(-2), dateFin: jour(10), blocPromo: null,
  update: mockAutreUpdate, ...extra,
});

beforeEach(() => {
  mockCreate.mockImplementation((d) => Promise.resolve({ id: 'nouvelle', ...d }));
  mockFindAll.mockResolvedValue([existante()]);
  mockPromoUpdate.mockImplementation(function maj(d) { Object.assign(this, d); return Promise.resolve(this); });
  mockAutreUpdate.mockResolvedValue(null);
});

test('même remise dans une autre section : acceptée', async () => {
  const r = await Service.create({ produitId: 'p1', section: 'a_ne_pas_rater', pourcentageReduction: 25 });
  expect(r.success).toBe(true);
});

test('remise différente : refusée, avec la section et le prix existants', async () => {
  const r = await Service.create({ produitId: 'p1', section: 'a_ne_pas_rater', pourcentageReduction: 10 });
  expect(r.success).toBe(false);
  expect(r.message).toMatch(/Nos promos du moment/);
  expect(r.message).toMatch(/15\s000 FCFA/);
  expect(mockCreate).not.toHaveBeenCalled();
});

test('sous-section nommée dans le message', async () => {
  mockFindAll.mockResolvedValue([existante({ section: 'a_ne_pas_rater', blocPromo: { titre: 'Ramadan' } })]);
  const r = await Service.create({ produitId: 'p1', section: 'nos_promos_a_venir', pourcentageReduction: 10 });
  expect(r.message).toMatch(/À ne pas rater › Ramadan/);
});

test('périodes qui ne se chevauchent pas : remise différente acceptée', async () => {
  const r = await Service.create({
    produitId: 'p1', section: 'nos_promos_a_venir', pourcentageReduction: 10,
    dateDebut: jour(20), dateFin: jour(30),
  });
  expect(r.success).toBe(true);
});

test('mise en avant sans remise : pas une promotion concurrente', async () => {
  mockFindAll.mockResolvedValue([existante({ prixPromo: null, pourcentageReduction: null })]);
  const r = await Service.create({ produitId: 'p1', section: 'a_ne_pas_rater', pourcentageReduction: 10 });
  expect(r.success).toBe(true);
});

test('modifier la remise : refusé sans confirmation, appliqué partout avec', async () => {
  const refus = await Service.update('moi', { pourcentageReduction: 50 });
  expect(refus.success).toBe(false);
  expect(mockAutreUpdate).not.toHaveBeenCalled();

  const ok = await Service.update('moi', { pourcentageReduction: 50, appliquerPartout: true });
  expect(ok.success).toBe(true);
  expect(mockAutreUpdate).toHaveBeenCalledWith({ prixPromo: 10000, pourcentageReduction: 50 });
  expect(ok.message).toMatch(/1 autre\(s\) section/);
});
