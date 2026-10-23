/**
 * Instrumentation du stock sur le cycle de vie d'une commande.
 *
 * Vérifie que les deux chemins client qui déplacent réellement du stock —
 * création et annulation — écrivent leur mouvement DANS la transaction qui
 * modifie `produits.stock`, et qu'une annulation refusée n'en écrit aucun.
 * Le rejet administrateur est couvert par
 * `tests/integration/admin.commande.rejet.test.js`.
 */
jest.mock('../../../src/models', () => {
  const stub = () => ({
    findOne: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(async () => []),
    create: jest.fn(),
    update: jest.fn(async () => [1]),
    bulkCreate: jest.fn(async () => []),
    destroy: jest.fn(),
    increment: jest.fn(async () => null),
  });
  return {
    Commande: stub(),
    CommandeItem: stub(),
    Panier: stub(),
    Produit: stub(),
    Adresse: stub(),
    Paiement: stub(),
    FraisLivraison: stub(),
    User: stub(),
    MouvementStock: stub(),
    sequelize: { transaction: jest.fn(), literal: jest.fn((s) => s) },
  };
});
jest.mock('../../../src/utils/mailer', () => ({
  sendCommandeConfirmation: jest.fn(async () => null),
}));
jest.mock('../../../src/utils/advisoryLock', () => ({ acquireXact: jest.fn(async () => null) }));
jest.mock('../../../src/services/notification', () => ({ emettre: jest.fn(async () => null) }));

const {
  Commande,
  CommandeItem,
  Produit,
  Adresse,
  Paiement,
  Panier,
  User,
  MouvementStock,
  sequelize,
} = require('../../../src/models');
const CommandeService = require('../../../src/services/client/commande.service');

const ID_CLIENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID_ADRESSE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_COMMANDE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ID_PRODUIT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

let transaction;

/** Produits renvoyés selon l'appel : fiche complète, puis stock après coup. */
const brancherProduits = (stockApres) => {
  Produit.findAll.mockImplementation(async ({ attributes }) => {
    if (attributes.includes('prix')) {
      return [
        {
          id: ID_PRODUIT,
          nom: 'Riz parfumé 5 kg',
          prix: 5000,
          stock: 10,
          isActive: true,
          statutValidation: 'valide',
          vendeurId: null,
        },
      ];
    }
    return [{ id: ID_PRODUIT, stock: stockApres }];
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  transaction = { commit: jest.fn(), rollback: jest.fn(), finished: false };
  sequelize.transaction.mockResolvedValue(transaction);
  sequelize.literal.mockImplementation((s) => s);
  Adresse.findOne.mockResolvedValue({ id: ID_ADRESSE, userId: ID_CLIENT, ville: 'Dakar' });
  FraisDefaut();
  Commande.create.mockResolvedValue({ id: ID_COMMANDE, reference: 'CMD-1', montantTotal: 5000 });
  Commande.findByPk.mockResolvedValue({ id: ID_COMMANDE, reference: 'CMD-1', items: [] });
  CommandeItem.bulkCreate.mockResolvedValue([]);
  Paiement.create.mockResolvedValue({});
  Panier.destroy.mockResolvedValue(1);
  Produit.update.mockResolvedValue([1]);
  Produit.increment.mockResolvedValue(null);
  MouvementStock.bulkCreate.mockResolvedValue([]);
  User.findByPk.mockResolvedValue(null);
});

/** Aucun tarif en base : le forfait par défaut s'applique. */
function FraisDefaut() {
  const { FraisLivraison } = require('../../../src/models');
  FraisLivraison.findOne.mockResolvedValue(null);
}

describe('Création de commande', () => {
  it('écrit une sortie de stock dans la transaction de la décrémentation', async () => {
    brancherProduits(7);

    const resultat = await CommandeService.creerCommande(ID_CLIENT, {
      adresseId: ID_ADRESSE,
      methode: 'wave',
      items: [{ produitId: ID_PRODUIT, quantite: 3 }],
    });

    expect(resultat.success).toBe(true);
    const [lignes, options] = MouvementStock.bulkCreate.mock.calls[0];
    expect(options).toEqual({ transaction, ignoreDuplicates: true });
    expect(lignes[0]).toMatchObject({
      produitId: ID_PRODUIT,
      type: 'sortie',
      source: 'commande_creation',
      ancienneQuantite: 10,
      nouvelleQuantite: 7,
      difference: -3,
      commandeId: ID_COMMANDE,
      clientId: ID_CLIENT,
      cleIdempotence: `commande:${ID_COMMANDE}:creation:${ID_PRODUIT}`,
    });
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  it('stock insuffisant : transaction annulée, aucun mouvement écrit', async () => {
    brancherProduits(10);
    Produit.update.mockResolvedValue([0]); // WHERE stock >= quantite n'a rien touché
    Produit.findByPk.mockResolvedValue({ stock: 1 });

    const resultat = await CommandeService.creerCommande(ID_CLIENT, {
      adresseId: ID_ADRESSE,
      methode: 'wave',
      items: [{ produitId: ID_PRODUIT, quantite: 3 }],
    });

    expect(resultat.success).toBe(false);
    expect(resultat.status).toBe(400);
    expect(MouvementStock.bulkCreate).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });
});

describe('Annulation de commande par le client', () => {
  const commandeEnAttente = () => ({
    id: ID_COMMANDE,
    userId: ID_CLIENT,
    statut: 'en_attente',
    items: [{ produitId: ID_PRODUIT, quantite: 3 }],
    update: jest.fn(async () => null),
  });

  it('écrit une entrée de stock dans la transaction de la restauration', async () => {
    Commande.findByPk.mockResolvedValue(commandeEnAttente());
    Produit.findAll.mockResolvedValue([{ id: ID_PRODUIT, stock: 13 }]);

    const resultat = await CommandeService.annulerCommande(ID_CLIENT, ID_COMMANDE);

    expect(resultat.success).toBe(true);
    const [lignes, options] = MouvementStock.bulkCreate.mock.calls[0];
    expect(options).toEqual({ transaction, ignoreDuplicates: true });
    expect(lignes[0]).toMatchObject({
      type: 'entree',
      source: 'commande_annulation',
      ancienneQuantite: 10,
      nouvelleQuantite: 13,
      difference: 3,
      cleIdempotence: `commande:${ID_COMMANDE}:annulation:${ID_PRODUIT}`,
    });
  });

  it('commande déjà validée : refus, aucun mouvement', async () => {
    Commande.findByPk.mockResolvedValue({ ...commandeEnAttente(), statut: 'validee' });

    const resultat = await CommandeService.annulerCommande(ID_CLIENT, ID_COMMANDE);

    expect(resultat.success).toBe(false);
    expect(MouvementStock.bulkCreate).not.toHaveBeenCalled();
    expect(Produit.increment).not.toHaveBeenCalled();
  });
});
