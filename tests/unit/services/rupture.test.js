// tests/unit/services/rupture.test.js
// Produits en rupture de stock déclarés par l'administration : le client est
// prévenu (notification + email) avec le motif, et ne paie plus ces produits.

const ligne = (produitId, nom, sousTotal) => {
  const l = {
    produitId,
    quantite: 1,
    sousTotal,
    enRupture: false,
    produit: { id: produitId, nom },
  };
  l.update = jest.fn(async (maj) => Object.assign(l, maj));
  return l;
};

let commande;
const mockModels = {
  Commande: { scope: () => ({ findByPk: jest.fn(async () => commande) }) },
  CommandeItem: {},
  // `findAll` sert au journal du stock : relecture des quantités d'avant.
  Produit: {
    update: jest.fn(),
    findAll: jest.fn(async () => [
      { id: 'p1', stock: 4 },
      { id: 'p2', stock: 7 },
    ]),
  },
  MouvementStock: { bulkCreate: jest.fn(async () => []) },
  User: {},
  Adresse: {},
  Paiement: {},
  AcceptationCommande: {},
  Retour: {},
  sequelize: { transaction: async () => ({ commit: jest.fn(), rollback: jest.fn() }) },
};
jest.mock('../../../src/models', () => mockModels);
const mockEmettre = jest.fn();
jest.mock('../../../src/services/notification', () => ({ emettre: (...a) => mockEmettre(...a) }));
const mockMail = jest.fn();
jest.mock('../../../src/utils/mailer', () => ({
  sendCommandeStatut: jest.fn(),
  sendRuptureStock: (...a) => mockMail(...a),
}));

const Service = require('../../../src/services/admin/commande.service');

beforeEach(() => {
  jest.clearAllMocks();
  // `resetMocks` de jest.config efface les implémentations de la fabrique :
  // on réarme celles dont le service a besoin.
  mockModels.Produit.findAll.mockResolvedValue([
    { id: 'p1', stock: 4 },
    { id: 'p2', stock: 7 },
  ]);
  mockModels.MouvementStock.bulkCreate.mockResolvedValue([]);
  commande = {
    id: 'c1',
    reference: 'CMD-1',
    statut: 'en_attente',
    userId: 'u1',
    user: { email: 'client@example.com' },
    fraisLivraison: '1000',
    montantTotal: '6000',
    items: [ligne('p1', 'Télévision', '3000'), ligne('p2', 'Radio', '2000')],
  };
  commande.update = jest.fn(async (maj) => Object.assign(commande, maj));
  jest.spyOn(Service, 'getCommandeById').mockResolvedValue({ commande });
});

test('motif obligatoire', async () => {
  const r = await Service.marquerRupture('c1', { produitIds: ['p1'], motif: ' ' });
  expect(r).toMatchObject({ success: false, status: 400 });
});

test('le client est prévenu avec le motif, et ne paie plus le produit', async () => {
  const r = await Service.marquerRupture('c1', { produitIds: ['p1'], motif: 'Plus en stock chez le vendeur' });
  expect(r.success).toBe(true);
  expect(commande.items[0]).toMatchObject({ enRupture: true, motifRupture: 'Plus en stock chez le vendeur' });
  expect(mockModels.Produit.update).toHaveBeenCalledWith({ stock: 0 }, expect.objectContaining({ where: { id: 'p1' } }));
  // 2000 (radio) + 1000 (livraison)
  expect(commande.montantTotal).toBe(3000);
  expect(mockEmettre).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: 'u1',
      type: 'commande_rupture',
      message: expect.stringContaining('Plus en stock chez le vendeur'),
    })
  );
  expect(mockMail).toHaveBeenCalledWith('client@example.com', commande, {
    produits: ['Télévision'],
    motif: 'Plus en stock chez le vendeur',
  });
  expect(r.toutEnRupture).toBe(false);
});

test('tout en rupture : montant nul et annulation suggérée', async () => {
  const r = await Service.marquerRupture('c1', { produitIds: ['p1', 'p2'], motif: 'Rupture totale' });
  expect(commande.montantTotal).toBe(0);
  expect(r.toutEnRupture).toBe(true);
});

test('la mise à zéro est tracée au journal du stock', async () => {
  await Service.marquerRupture('c1', {
    produitIds: ['p1'],
    motif: 'Plus en stock chez le vendeur',
    adminId: 'admin-1',
  });

  const [lignes, options] = mockModels.MouvementStock.bulkCreate.mock.calls[0];
  expect(options).toMatchObject({ ignoreDuplicates: true });
  expect(lignes).toEqual([
    expect.objectContaining({
      produitId: 'p1',
      type: 'ajustement_negatif',
      source: 'commande_rupture',
      difference: -4,
      auteurId: 'admin-1',
      commentaire: 'Plus en stock chez le vendeur',
      cleIdempotence: 'commande:c1:rupture:p1',
    }),
  ]);
});

test('commande livrée : refus', async () => {
  commande.statut = 'livree';
  const r = await Service.marquerRupture('c1', { produitIds: ['p1'], motif: 'Rupture' });
  expect(r).toMatchObject({ success: false, status: 400 });
});
