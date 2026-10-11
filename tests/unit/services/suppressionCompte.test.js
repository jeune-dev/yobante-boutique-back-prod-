// tests/unit/services/suppressionCompte.test.js
// Suppression d'un compte client ou vendeur par l'administration.

const mockUser = { findOne: jest.fn() };
const mockCommande = { count: jest.fn() };
const destroy = () => ({ destroy: jest.fn() });
const mockModels = {
  User: mockUser,
  Commande: mockCommande,
  CommandeItem: {},
  Produit: { update: jest.fn() },
  ProfilVendeur: { update: jest.fn() },
  RefreshToken: destroy(),
  DeviceToken: destroy(),
  UserOtp: destroy(),
  Panier: destroy(),
  Favori: destroy(),
  Notification: destroy(),
  // Fonction simple (pas jest.fn) : la configuration réinitialise les mocks.
  sequelize: { transaction: (fn) => fn({}) },
};
jest.mock('../../../src/models', () => mockModels);

const Service = require('../../../src/services/admin/suppressionCompte.service');

const compte = (role) => ({
  id: 'u1',
  role,
  prenom: 'Awa',
  nom: 'Diop',
  update: jest.fn(),
});

beforeEach(() => jest.clearAllMocks());

test('compte introuvable (ou déjà supprimé) → 404', async () => {
  mockUser.findOne.mockResolvedValue(null);
  const r = await Service.supprimer('u1', 'CLIENT');
  expect(r).toMatchObject({ success: false, status: 404 });
  expect(mockUser.findOne).toHaveBeenCalledWith({
    where: { id: 'u1', role: 'CLIENT', supprimeLe: null },
  });
});

test('commandes en cours → refus 409, rien n’est modifié', async () => {
  const u = compte('CLIENT');
  mockUser.findOne.mockResolvedValue(u);
  mockCommande.count.mockResolvedValue(2);
  const r = await Service.supprimer('u1', 'CLIENT');
  expect(r).toMatchObject({ success: false, status: 409 });
  expect(r.message).toContain('2 commandes en cours');
  expect(u.update).not.toHaveBeenCalled();
});

test('client : anonymisé, fermé, sessions et appareils retirés', async () => {
  const u = compte('CLIENT');
  mockUser.findOne.mockResolvedValue(u);
  mockCommande.count.mockResolvedValue(0);

  const r = await Service.supprimer('u1', 'CLIENT');

  expect(r).toEqual({ success: true, message: 'Le compte de Awa Diop a été supprimé' });
  const maj = u.update.mock.calls[0][0];
  expect(maj).toMatchObject({ telephone: null, avatar: null, isActive: false });
  expect(maj.email).toBe('supprime-u1@compte-supprime.yobante.com');
  expect(maj.supprimeLe).toBeInstanceOf(Date);
  expect(maj.password).toMatch(/^\$2[aby]\$/); // haché : aucun mot de passe connu
  expect(mockModels.RefreshToken.destroy).toHaveBeenCalled();
  expect(mockModels.DeviceToken.destroy).toHaveBeenCalled();
  expect(mockModels.Produit.update).not.toHaveBeenCalled();
});

test('vendeur : ses produits quittent le catalogue', async () => {
  mockUser.findOne.mockResolvedValue(compte('VENDEUR'));
  mockCommande.count.mockResolvedValue(0);
  const r = await Service.supprimer('u1', 'VENDEUR');
  expect(r.success).toBe(true);
  expect(mockModels.Produit.update).toHaveBeenCalledWith(
    { isActive: false },
    expect.objectContaining({ where: { vendeurId: 'u1' } })
  );
  expect(mockModels.ProfilVendeur.update).toHaveBeenCalled();
});
