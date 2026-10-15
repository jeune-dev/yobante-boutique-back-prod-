// tests/unit/services/adresses.test.js
// Carnet d'adresses : domicile unique, adresses non enregistrées, historique
// des commandes préservé.

const adresse = (champs) => ({
  ...champs,
  update: jest.fn(async (maj) => Object.assign(adresse, maj)),
  destroy: jest.fn(),
  get: () => ({ ...champs }),
});

const mockAdresse = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  count: jest.fn(),
  create: jest.fn(async (data) => ({ id: 'nouvelle', ...data })),
  update: jest.fn(),
};
const mockCommande = { count: jest.fn() };
const transaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { UPDATE: 'UPDATE' } };
const mockModels = {
  User: { findByPk: jest.fn() },
  Adresse: mockAdresse,
  Commande: mockCommande,
  sequelize: { transaction: async () => transaction },
};
jest.mock('../../../src/models', () => mockModels);
jest.mock('../../../src/services/r2.service', () => ({ uploadImage: jest.fn(), deleteImage: jest.fn() }));

const ProfilService = require('../../../src/services/client/profil.service');

beforeEach(() => {
  jest.clearAllMocks();
  mockAdresse.count.mockResolvedValue(0);
  mockAdresse.findAll.mockResolvedValue([]);
});

test('le carnet ne liste que les adresses enregistrées', async () => {
  await ProfilService.getAdresses('u1');
  expect(mockAdresse.findAll).toHaveBeenCalledWith(
    expect.objectContaining({ where: { userId: 'u1', estEnregistree: true } })
  );
});

test('nouveau domicile : l’ancien est retiré, pas de doublon', async () => {
  const ancien = adresse({ id: 'a1', isDefault: true });
  mockAdresse.findAll.mockResolvedValue([ancien]);
  mockCommande.count.mockResolvedValue(0);
  await ProfilService.ajouterAdresse('u1', { rue: 'Rue 10', ville: 'Dakar', isDefault: true });
  expect(ancien.destroy).toHaveBeenCalled();
  expect(mockAdresse.create).toHaveBeenCalledWith(
    expect.objectContaining({ isDefault: true, estEnregistree: true }),
    expect.anything()
  );
});

test('ancien domicile déjà utilisé par une commande : masqué, pas effacé', async () => {
  const ancien = adresse({ id: 'a1', isDefault: true });
  mockAdresse.findAll.mockResolvedValue([ancien]);
  mockCommande.count.mockResolvedValue(2);
  await ProfilService.ajouterAdresse('u1', { rue: 'Rue 10', ville: 'Dakar', isDefault: true });
  expect(ancien.destroy).not.toHaveBeenCalled();
  expect(ancien.update).toHaveBeenCalledWith(
    { isDefault: false, estEnregistree: false },
    expect.anything()
  );
});

test('adresse non enregistrée : créée pour la commande, absente du carnet', async () => {
  await ProfilService.ajouterAdresse('u1', { rue: 'Chez un ami', ville: 'Thiès', enregistrer: false });
  expect(mockAdresse.count).not.toHaveBeenCalled();
  expect(mockAdresse.create).toHaveBeenCalledWith(
    expect.objectContaining({ estEnregistree: false, isDefault: false }),
    expect.anything()
  );
});

test('renommer une adresse utilisée par une commande crée une nouvelle version', async () => {
  const existante = adresse({ id: 'a2', libelle: null, rue: 'Rue 5', ville: 'Dakar', isDefault: false });
  mockAdresse.findOne.mockResolvedValue(existante);
  mockCommande.count.mockResolvedValue(1);
  const r = await ProfilService.updateAdresse('u1', 'a2', { libelle: 'Chez papa' });
  expect(r.success).toBe(true);
  expect(mockAdresse.create).toHaveBeenCalledWith(
    expect.objectContaining({ libelle: 'Chez papa', rue: 'Rue 5' }),
    expect.anything()
  );
  expect(existante.update).toHaveBeenCalledWith(
    { isDefault: false, estEnregistree: false },
    expect.anything()
  );
});

test('supprimer une adresse jamais utilisée l’efface', async () => {
  const a = adresse({ id: 'a3' });
  mockAdresse.findOne.mockResolvedValue(a);
  mockCommande.count.mockResolvedValue(0);
  const r = await ProfilService.supprimerAdresse('u1', 'a3');
  expect(r.success).toBe(true);
  expect(a.destroy).toHaveBeenCalled();
});
