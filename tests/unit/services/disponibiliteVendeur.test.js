// tests/unit/services/disponibiliteVendeur.test.js
// Confirmation de disponibilité par le vendeur et retour à l'administration.

const mockModels = {
  Commande: { scope: jest.fn() },
  CommandeItem: { findAll: jest.fn() },
  Produit: {},
  User: { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn() },
  Adresse: {},
  Paiement: {},
  AcceptationCommande: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  sequelize: { fn: jest.fn(), col: jest.fn() },
};
jest.mock('../../../src/models', () => mockModels);
jest.mock('../../../src/utils/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue({}),
  sendCommandeStatut: jest.fn(),
}));
jest.mock('../../../src/services/notification', () => ({ emettre: jest.fn().mockResolvedValue(null) }));

const { sendMail } = require('../../../src/utils/mailer');
const NotificationService = require('../../../src/services/notification');
const VendeurCommandeService = require('../../../src/services/vendeur/commande.service');
const GestionCommandeService = require('../../../src/services/admin/commande.service');

const commande = {
  id: 'c1',
  reference: 'CMD-001',
  statut: 'en_attente',
  montantTotal: 10000,
  items: [{ quantite: 2, sousTotal: 5000, produit: { id: 'p1', nom: 'Sac en cuir', vendeurId: 'v1' } }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockModels.Commande.scope.mockReturnValue({
    findAll: jest.fn().mockResolvedValue([{ toJSON: () => JSON.parse(JSON.stringify(commande)) }]),
  });
});

describe('Vendeur — produit indisponible', () => {
  test('le motif est obligatoire', async () => {
    const r = await VendeurCommandeService.decider('v1', 'c1', { statut: 'refusee', motif: '  ' });
    expect(r).toMatchObject({ success: false, status: 400 });
    expect(mockModels.AcceptationCommande.create).not.toHaveBeenCalled();
  });

  test("le refus est enregistré, notifié et envoyé par email aux administrateurs", async () => {
    mockModels.AcceptationCommande.findOne.mockResolvedValue(null);
    mockModels.AcceptationCommande.create.mockResolvedValue({ statut: 'refusee' });
    mockModels.User.findAll.mockResolvedValue([
      { id: 'a1', email: 'admin@yobante.com' },
      { id: 'a2', email: null },
    ]);
    mockModels.User.findByPk.mockResolvedValue({
      prenom: 'Moussa',
      nom: 'Diop',
      telephone: '+221770000000',
      profilVendeur: { nomBoutique: 'Chez Moussa' },
    });

    const r = await VendeurCommandeService.decider('v1', 'c1', {
      statut: 'refusee',
      motif: ' Rupture de stock ',
    });

    expect(r.success).toBe(true);
    expect(mockModels.AcceptationCommande.create).toHaveBeenCalledWith(
      expect.objectContaining({ statut: 'refusee', motifRefus: 'Rupture de stock' })
    );
    expect(NotificationService.emettre).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['a1', 'a2'], type: 'commande_refusee_vendeur' })
    );
    // Seuls les administrateurs avec une adresse reçoivent l'email.
    expect(sendMail).toHaveBeenCalledTimes(1);
    const email = sendMail.mock.calls[0][0];
    expect(email.to).toBe('admin@yobante.com');
    expect(email.subject).toContain('CMD-001');
    expect(email.html).toContain('Rupture de stock');
    expect(email.html).toContain('Chez Moussa');
    expect(email.html).toContain('2 × Sac en cuir');
    expect(email.html).toContain('/boutique/commandes/c1');
  });

  test('une disponibilité confirmée ne prévient pas les administrateurs', async () => {
    mockModels.AcceptationCommande.findOne.mockResolvedValue(null);
    mockModels.AcceptationCommande.create.mockResolvedValue({ statut: 'acceptee' });
    const r = await VendeurCommandeService.decider('v1', 'c1', { statut: 'acceptee' });
    expect(r.success).toBe(true);
    expect(sendMail).not.toHaveBeenCalled();
    expect(NotificationService.emettre).not.toHaveBeenCalled();
  });
});

describe('Admin — réponse des vendeurs sur une commande', () => {
  test('chaque vendeur avec ses produits, sa réponse et le motif', async () => {
    mockModels.CommandeItem.findAll.mockResolvedValue([
      { quantite: 1, produit: { id: 'p1', nom: 'Sac', vendeurId: 'v1' } },
      { quantite: 3, produit: { id: 'p2', nom: 'Ceinture', vendeurId: 'v2' } },
    ]);
    mockModels.User.findAll.mockResolvedValue([
      { id: 'v1', prenom: 'Moussa', nom: 'Diop', profilVendeur: { nomBoutique: 'Chez Moussa' } },
      { id: 'v2', prenom: 'Awa', nom: 'Ba', profilVendeur: null },
    ]);
    mockModels.AcceptationCommande.findAll.mockResolvedValue([
      { vendeurId: 'v1', statut: 'refusee', motifRefus: 'Rupture de stock', decideLe: null },
    ]);

    const liste = await GestionCommandeService.getDisponibilitesVendeurs('c1');

    expect(liste).toEqual([
      expect.objectContaining({
        vendeurId: 'v1',
        boutique: 'Chez Moussa',
        produits: ['1 × Sac'],
        statut: 'refusee',
        motifRefus: 'Rupture de stock',
      }),
      expect.objectContaining({ vendeurId: 'v2', vendeur: 'Awa Ba', statut: 'en_attente' }),
    ]);
  });
});
