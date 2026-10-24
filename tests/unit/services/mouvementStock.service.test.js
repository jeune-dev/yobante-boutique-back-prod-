/**
 * Journal des mouvements de stock — écriture.
 *
 * Vérifie le type déduit de la source et du sens, le calcul de la quantité
 * d'avant à partir de la quantité relue en base, la transmission de la
 * transaction, et les clés d'idempotence (fixes pour un évènement de commande
 * qui ne se rejoue pas, rangées pour un retour qui peut basculer plusieurs
 * fois).
 */
jest.mock('../../../src/models', () => ({
  MouvementStock: { bulkCreate: jest.fn(), create: jest.fn(), count: jest.fn() },
  Produit: { findAll: jest.fn() },
}));

const { MouvementStock, Produit } = require('../../../src/models');
const {
  tracerMouvements,
  tracerMouvementsCommande,
  tracerAjustementManuel,
  tracerMouvementRetour,
  typeAjustement,
  typeDuMouvement,
} = require('../../../src/services/mouvementStock.service');
const { SOURCE_MOUVEMENT_STOCK } = require('../../../src/constants');

const ID_COMMANDE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_CLIENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID_ADMIN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ID_P1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ID_P2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ID_RETOUR = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const TX = { id: 'tx-test' };

beforeEach(() => {
  jest.clearAllMocks();
  MouvementStock.bulkCreate.mockImplementation(async (lignes) => lignes);
  MouvementStock.create.mockImplementation(async (ligne) => ligne);
  MouvementStock.count.mockResolvedValue(0);
});

describe('Type du mouvement', () => {
  it('se déduit du sens pour un ajustement', () => {
    expect(typeAjustement(5)).toBe('ajustement_positif');
    expect(typeAjustement(-5)).toBe('ajustement_negatif');
    expect(typeAjustement(0)).toBe('ajustement_neutre');
  });

  it('est fixé par la source quand elle ne laisse aucun doute', () => {
    expect(typeDuMouvement(SOURCE_MOUVEMENT_STOCK.COMMANDE_CREATION, -3)).toBe('sortie');
    expect(typeDuMouvement(SOURCE_MOUVEMENT_STOCK.COMMANDE_REJET, 3)).toBe('entree');
    expect(typeDuMouvement(SOURCE_MOUVEMENT_STOCK.RETOUR_REMISE_EN_STOCK, 2)).toBe('retour');
    expect(typeDuMouvement(SOURCE_MOUVEMENT_STOCK.COMMANDE_RUPTURE, -4)).toBe('ajustement_negatif');
  });

  it('suit le sens pour une modification de commande, qui va dans les deux sens', () => {
    expect(typeDuMouvement(SOURCE_MOUVEMENT_STOCK.COMMANDE_MODIFICATION, -2)).toBe('sortie');
    expect(typeDuMouvement(SOURCE_MOUVEMENT_STOCK.COMMANDE_MODIFICATION, 2)).toBe('entree');
  });
});

describe('tracerMouvements', () => {
  it('ignore les lignes sans écart plutôt que de polluer l’historique', async () => {
    await tracerMouvements(
      {
        source: SOURCE_MOUVEMENT_STOCK.COMMANDE_MODIFICATION,
        lignes: [{ produitId: ID_P1, difference: 0 }],
      },
      TX
    );

    expect(Produit.findAll).not.toHaveBeenCalled();
    expect(MouvementStock.bulkCreate).not.toHaveBeenCalled();
  });

  it('refuse une source absente plutôt que de deviner', async () => {
    await expect(tracerMouvements({ lignes: [] }, TX)).rejects.toThrow(/Source/);
  });
});

describe('tracerMouvementsCommande', () => {
  it('écrit une sortie par ligne à la création de la commande', async () => {
    // Stock relu APRÈS décrémentation : 10 - 3 = 7 et 5 - 1 = 4.
    Produit.findAll.mockResolvedValue([
      { id: ID_P1, stock: 7 },
      { id: ID_P2, stock: 4 },
    ]);

    await tracerMouvementsCommande(
      {
        commandeId: ID_COMMANDE,
        clientId: ID_CLIENT,
        source: SOURCE_MOUVEMENT_STOCK.COMMANDE_CREATION,
        sens: -1,
        evenement: 'creation',
        auteurId: ID_CLIENT,
        lignes: [
          { produitId: ID_P1, quantite: 3 },
          { produitId: ID_P2, quantite: 1 },
        ],
      },
      TX
    );

    const [lignes, options] = MouvementStock.bulkCreate.mock.calls[0];
    expect(options).toEqual({ transaction: TX, ignoreDuplicates: true });
    expect(lignes[0]).toEqual({
      produitId: ID_P1,
      type: 'sortie',
      source: 'commande_creation',
      ancienneQuantite: 10,
      nouvelleQuantite: 7,
      difference: -3,
      motif: null,
      commentaire: null,
      auteurId: ID_CLIENT,
      commandeId: ID_COMMANDE,
      retourId: null,
      clientId: ID_CLIENT,
      cleIdempotence: `commande:${ID_COMMANDE}:creation:${ID_P1}`,
    });
    expect(lignes[1]).toMatchObject({ ancienneQuantite: 5, nouvelleQuantite: 4, difference: -1 });
  });

  it('distingue les clés de création, d’annulation et de rejet', async () => {
    Produit.findAll.mockResolvedValue([{ id: ID_P1, stock: 10 }]);
    const cles = [];

    for (const [source, sens, evenement] of [
      [SOURCE_MOUVEMENT_STOCK.COMMANDE_CREATION, -1, 'creation'],
      [SOURCE_MOUVEMENT_STOCK.COMMANDE_ANNULATION, 1, 'annulation'],
      [SOURCE_MOUVEMENT_STOCK.COMMANDE_REJET, 1, 'rejet'],
    ]) {
      MouvementStock.bulkCreate.mockClear();
      await tracerMouvementsCommande(
        {
          commandeId: ID_COMMANDE,
          clientId: ID_CLIENT,
          source,
          sens,
          evenement,
          lignes: [{ produitId: ID_P1, quantite: 3 }],
        },
        TX
      );
      cles.push(MouvementStock.bulkCreate.mock.calls[0][0][0].cleIdempotence);
    }

    expect(new Set(cles).size).toBe(3);
  });

  it('rejoue la même opération avec la même clé : aucun doublon possible', async () => {
    Produit.findAll.mockResolvedValue([{ id: ID_P1, stock: 7 }]);
    const appel = () =>
      tracerMouvementsCommande(
        {
          commandeId: ID_COMMANDE,
          clientId: ID_CLIENT,
          source: SOURCE_MOUVEMENT_STOCK.COMMANDE_CREATION,
          sens: -1,
          evenement: 'creation',
          lignes: [{ produitId: ID_P1, quantite: 3 }],
        },
        TX
      );

    await appel();
    await appel();

    const [premier, second] = MouvementStock.bulkCreate.mock.calls;
    expect(premier[0][0].cleIdempotence).toBe(second[0][0].cleIdempotence);
    // La base tranche : ON CONFLICT DO NOTHING grâce à l'index unique.
    expect(premier[1].ignoreDuplicates).toBe(true);
    expect(second[1].ignoreDuplicates).toBe(true);
  });
});

describe('tracerAjustementManuel', () => {
  it("n'attache ni commande, ni retour, ni clé d'idempotence", async () => {
    await tracerAjustementManuel(
      {
        produitId: ID_P1,
        ancienneQuantite: 4,
        nouvelleQuantite: 9,
        motif: 'reapprovisionnement_fournisseur',
        auteurId: ID_ADMIN,
      },
      TX
    );

    expect(MouvementStock.create.mock.calls[0][0]).toMatchObject({
      type: 'ajustement_positif',
      source: 'ajustement_admin',
      difference: 5,
      commandeId: null,
      retourId: null,
      cleIdempotence: null,
    });
    expect(MouvementStock.create.mock.calls[0][1]).toEqual({ transaction: TX });
  });
});

describe('tracerMouvementRetour', () => {
  const retour = {
    id: ID_RETOUR,
    produitId: ID_P1,
    commandeId: ID_COMMANDE,
    userId: ID_CLIENT,
    quantite: 2,
    motif: 'produit_abime',
    motifDetail: 'Emballage déchiré',
  };

  it('remet en stock : type retour, écart positif, motif du retour conservé', async () => {
    Produit.findAll.mockResolvedValue([{ id: ID_P1, stock: 12 }]);

    await tracerMouvementRetour({ retour, remiseEnStock: true, auteurId: ID_ADMIN }, TX);

    expect(MouvementStock.bulkCreate.mock.calls[0][0][0]).toMatchObject({
      type: 'retour',
      source: 'retour_remise_en_stock',
      ancienneQuantite: 10,
      nouvelleQuantite: 12,
      difference: 2,
      motif: 'produit_abime',
      commentaire: 'Emballage déchiré',
      retourId: ID_RETOUR,
      commandeId: ID_COMMANDE,
      clientId: ID_CLIENT,
      auteurId: ID_ADMIN,
    });
  });

  it('annule une remise cochée à tort : ajustement négatif, pas une sortie', async () => {
    Produit.findAll.mockResolvedValue([{ id: ID_P1, stock: 10 }]);
    MouvementStock.count.mockResolvedValue(1);

    await tracerMouvementRetour({ retour, remiseEnStock: false, auteurId: ID_ADMIN }, TX);

    expect(MouvementStock.bulkCreate.mock.calls[0][0][0]).toMatchObject({
      type: 'ajustement_negatif',
      source: 'retour_correction',
      ancienneQuantite: 12,
      nouvelleQuantite: 10,
      difference: -2,
    });
  });

  it('un retour rebasculé garde une clé distincte à chaque mouvement réel', async () => {
    Produit.findAll.mockResolvedValue([{ id: ID_P1, stock: 12 }]);
    const cles = [];

    // remise (rang 0), correction (rang 1), remise à nouveau (rang 2).
    for (const [remise, rang] of [
      [true, 0],
      [false, 1],
      [true, 2],
    ]) {
      MouvementStock.count.mockResolvedValue(rang);
      MouvementStock.bulkCreate.mockClear();
      await tracerMouvementRetour({ retour, remiseEnStock: remise }, TX);
      cles.push(MouvementStock.bulkCreate.mock.calls[0][0][0].cleIdempotence);
    }

    expect(cles).toEqual([
      `retour:${ID_RETOUR}:remise:0`,
      `retour:${ID_RETOUR}:correction:1`,
      `retour:${ID_RETOUR}:remise:2`,
    ]);
    expect(new Set(cles).size).toBe(3);
  });

  it('compte le rang dans la transaction', async () => {
    Produit.findAll.mockResolvedValue([{ id: ID_P1, stock: 12 }]);

    await tracerMouvementRetour({ retour, remiseEnStock: true }, TX);

    expect(MouvementStock.count).toHaveBeenCalledWith({
      where: { retourId: ID_RETOUR },
      transaction: TX,
    });
  });
});
