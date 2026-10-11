// tests/unit/services/accesAdmin.test.js
// Accès des administrateurs page par page.

const { peutAppeler, normaliserPermissions } = require('../../../src/constants/accesAdmin');

describe('peutAppeler', () => {
  it('accès complet (null) : tout est permis', () => {
    expect(peutAppeler(null, 'DELETE', '/users/admins/1')).toBe(true);
    expect(peutAppeler(undefined, 'POST', '/finance/reversements')).toBe(true);
  });

  it('session et mot de passe toujours permis', () => {
    expect(peutAppeler(['produits'], 'GET', '/me')).toBe(true);
  });

  it('page Produits : lit et modifie les produits, lit les rayons, rien d’autre', () => {
    const p = ['produits'];
    expect(peutAppeler(p, 'GET', '/produits')).toBe(true);
    expect(peutAppeler(p, 'PUT', '/produits/12')).toBe(true);
    expect(peutAppeler(p, 'GET', '/rayons')).toBe(true);
    expect(peutAppeler(p, 'POST', '/rayons')).toBe(false);
    expect(peutAppeler(p, 'GET', '/finance/synthese')).toBe(false);
    expect(peutAppeler(p, 'PATCH', '/commandes/1/annuler')).toBe(false);
  });

  it('gestion des administrateurs réservée à la page Administrateurs', () => {
    expect(peutAppeler(['clients'], 'GET', '/users/clients')).toBe(true);
    expect(peutAppeler(['clients'], 'GET', '/users/admins')).toBe(false);
    expect(peutAppeler(['administrateurs'], 'POST', '/users/admins')).toBe(true);
  });

  it('route inconnue refusée pour un accès restreint', () => {
    expect(peutAppeler(['produits'], 'GET', '/inconnue')).toBe(false);
  });

  it('normalise : clés connues, sans doublon ; null = complet', () => {
    expect(normaliserPermissions(['produits', 'produits', 'pirate'])).toEqual(['produits']);
    expect(normaliserPermissions(null)).toBeNull();
  });
});

// ── Service : règles de sécurité ──────────────────────────────────────────
const mockUser = { findOne: jest.fn(), count: jest.fn(), create: jest.fn() };
jest.mock('../../../src/models', () => ({
  User: mockUser,
  RefreshToken: { update: jest.fn() },
  sequelize: { transaction: async () => ({ commit: async () => {}, rollback: async () => {} }) },
}));
jest.mock('../../../src/services/resend.service', () => ({ sendEmail: async () => ({ success: true }) }));
jest.mock('../../../src/services/admin/suppressionCompte.service', () => ({
  supprimer: async () => ({ success: true, message: 'supprimé' }),
}));
const Service = require('../../../src/services/admin/admin.service');

describe('GestionAdminService — accès', () => {
  beforeEach(() => jest.clearAllMocks());

  it('un admin restreint ne peut pas donner l’accès complet ni des pages qu’il n’a pas', async () => {
    const auteur = { id: 'a', permissions: ['produits', 'administrateurs'] };
    const r1 = await Service.ajouterAdmin({ nom: 'X', prenom: 'Y', email: 'x@y.sn', permissions: null }, auteur);
    expect(r1).toMatchObject({ success: false, status: 403 });
    const r2 = await Service.ajouterAdmin(
      { nom: 'X', prenom: 'Y', email: 'x@y.sn', permissions: ['finance'] },
      auteur
    );
    expect(r2.message).toContain('finance');
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it('au moins une page est exigée', async () => {
    const r = await Service.ajouterAdmin(
      { nom: 'X', prenom: 'Y', email: 'x@y.sn', permissions: [] },
      { id: 'a', permissions: null }
    );
    expect(r).toMatchObject({ success: false, message: 'Cochez au moins une page.' });
  });

  it('on ne modifie pas ses propres accès', async () => {
    mockUser.findOne.mockResolvedValue({ id: 'a', permissions: null, update: jest.fn() });
    const r = await Service.modifierAdmin('a', { permissions: ['produits'] }, { id: 'a', permissions: null });
    expect(r).toMatchObject({ success: false, status: 403 });
  });

  it('le dernier accès complet ne peut être ni restreint ni supprimé', async () => {
    const update = jest.fn();
    mockUser.findOne.mockResolvedValue({ id: 'b', permissions: null, update });
    mockUser.count.mockResolvedValue(0);
    const r1 = await Service.modifierAdmin('b', { permissions: ['produits'] }, { id: 'a', permissions: null });
    expect(r1).toMatchObject({ success: false, status: 409 });
    expect(update).not.toHaveBeenCalled();
    const r2 = await Service.supprimerAdmin('b', 'a');
    expect(r2).toMatchObject({ success: false, status: 409 });
  });

  it('restreindre un admin quand il reste un autre accès complet', async () => {
    const update = jest.fn();
    mockUser.findOne.mockResolvedValue({ id: 'b', permissions: null, update, email: 'b@y.sn' });
    mockUser.count.mockResolvedValue(1);
    const r = await Service.modifierAdmin('b', { permissions: ['commandes'] }, { id: 'a', permissions: null });
    expect(r.success).toBe(true);
    expect(update).toHaveBeenCalledWith({ permissions: ['commandes'] });
  });

  it('on ne se supprime pas soi-même', async () => {
    const r = await Service.supprimerAdmin('a', 'a');
    expect(r).toMatchObject({ success: false, status: 403 });
  });
});
