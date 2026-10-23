/**
 * Écriture du journal de stock pour les mouvements de commande.
 *
 * Vérifie le sens et le type du mouvement selon l'évènement, le calcul de la
 * quantité d'avant à partir de la quantité relue en base, la transmission de
 * la transaction, et la clé d'idempotence qui empêche un doublon en cas de
 * rejeu (`ignoreDuplicates`).
 */
jest.mock('../../../src/models', () => ({
  MouvementStock: { bulkCreate: jest.fn(), create: jest.fn() },
  Produit: { findAll: jest.fn() },
}));

const { MouvementStock, Produit } = require('../../../src/models');
const {
  tracerMouvementsCommande,
  tracerAjustementManuel,
  typeAjustement,
} = require('../../../src/services/mouvementStock.service');

const ID_COMMANDE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_CLIENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID_ADMIN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ID_P1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ID_P2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const TX = { id: 'tx-test' };

beforeEach(() => {
  jest.clearAllMocks();
  MouvementStock.bulkCreate.mockImplementation(async (lignes) => lignes);
  MouvementStock.create.mockImplementation(async (ligne) => ligne);
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
      clientId: ID_CLIENT,
      cleIdempotence: `commande:${ID_COMMANDE}:creation:${ID_P1}`,
    });
    expect(lignes[1]).toMatchObject({
      ancienneQuantite: 5,
      nouvelleQuantite: 4,
      difference: -1,
    });
  });

  it("écrit une entrée à l'annulation, avec sa propre clé", async () => {
    Produit.findAll.mockResolvedValue([{ id: ID_P1, stock: 10 }]);

    await tracerMouvementsCommande(
      {
        commandeId: ID_COMMANDE,
        clientId: ID_CLIENT,
        evenement: 'annulation',
        auteurId: ID_CLIENT,
        lignes: [{ produitId: ID_P1, quantite: 3 }],
      },
      TX
    );

    expect(MouvementStock.bulkCreate.mock.calls[0][0][0]).toMatchObject({
      type: 'entree',
      source: 'commande_annulation',
      ancienneQuantite: 7,
      nouvelleQuantite: 10,
      difference: 3,
      cleIdempotence: `commande:${ID_COMMANDE}:annulation:${ID_P1}`,
    });
  });

  it('écrit une entrée au rejet, distincte de celle de la création', async () => {
    Produit.findAll.mockResolvedValue([{ id: ID_P1, stock: 10 }]);

    await tracerMouvementsCommande(
      {
        commandeId: ID_COMMANDE,
        clientId: ID_CLIENT,
        evenement: 'rejet',
        auteurId: ID_ADMIN,
        lignes: [{ produitId: ID_P1, quantite: 3 }],
      },
      TX
    );

    const ligne = MouvementStock.bulkCreate.mock.calls[0][0][0];
    expect(ligne.source).toBe('commande_rejet');
    expect(ligne.auteurId).toBe(ID_ADMIN);
    expect(ligne.cleIdempotence).toBe(`commande:${ID_COMMANDE}:rejet:${ID_P1}`);
    expect(ligne.cleIdempotence).not.toBe(`commande:${ID_COMMANDE}:creation:${ID_P1}`);
  });

  it('rejoue la même opération avec la même clé : aucun doublon possible', async () => {
    Produit.findAll.mockResolvedValue([{ id: ID_P1, stock: 7 }]);
    const appel = () =>
      tracerMouvementsCommande(
        {
          commandeId: ID_COMMANDE,
          clientId: ID_CLIENT,
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

  it("n'écrit rien quand la commande ne porte aucune ligne", async () => {
    await tracerMouvementsCommande(
      { commandeId: ID_COMMANDE, clientId: ID_CLIENT, evenement: 'creation', lignes: [] },
      TX
    );

    expect(Produit.findAll).not.toHaveBeenCalled();
    expect(MouvementStock.bulkCreate).not.toHaveBeenCalled();
  });

  it('refuse un évènement inconnu plutôt que de deviner', async () => {
    await expect(
      tracerMouvementsCommande(
        { commandeId: ID_COMMANDE, clientId: ID_CLIENT, evenement: 'livraison', lignes: [] },
        TX
      )
    ).rejects.toThrow(/livraison/);
  });
});

describe('tracerAjustementManuel', () => {
  it('déduit le type du sens de l’écart', () => {
    expect(typeAjustement(5)).toBe('ajustement_positif');
    expect(typeAjustement(-5)).toBe('ajustement_negatif');
    expect(typeAjustement(0)).toBe('ajustement_neutre');
  });

  it("n'attache ni commande ni clé d'idempotence", async () => {
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
      clientId: null,
      cleIdempotence: null,
    });
    expect(MouvementStock.create.mock.calls[0][1]).toEqual({ transaction: TX });
  });
});
