/**
 * Instrumentation du stock sur le traitement d'un retour.
 *
 * `traiterRetour` est le SEUL chemin où le stock bouge pour un retour :
 * `creerRetour({ remisEnStock: true })` y délègue. Le mouvement doit donc
 * être écrit là, dans la transaction de l'incrément, et nulle part ailleurs —
 * sinon un retour créé « déjà remis en stock » compterait deux fois.
 */
jest.mock('../../../src/models', () => {
  const vide = () => ({
    findByPk: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    sum: jest.fn(),
    bulkCreate: jest.fn(),
  });
  return {
    Retour: vide(),
    Commande: vide(),
    CommandeItem: vide(),
    Produit: { ...vide(), scope: jest.fn() },
    User: vide(),
    MouvementStock: vide(),
    sequelize: { transaction: jest.fn(), query: jest.fn(), QueryTypes: { SELECT: 'SELECT' } },
  };
});

const { Retour, Produit, MouvementStock, sequelize } = require('../../../src/models');
const RetourService = require('../../../src/services/admin/retour.service');

const ID_RETOUR = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const ID_PRODUIT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ID_COMMANDE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_CLIENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID_ADMIN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

let transaction;

/** Retour en base, avec un `update` qui applique la modification. */
const retourFactice = (remisEnStock = false) => {
  const instance = {
    id: ID_RETOUR,
    produitId: ID_PRODUIT,
    commandeId: ID_COMMANDE,
    userId: ID_CLIENT,
    quantite: 2,
    motif: 'produit_abime',
    motifDetail: null,
    statut: 'demande',
    remisEnStock,
    traitePar: null,
    update: jest.fn(async (maj) => Object.assign(instance, maj)),
  };
  return instance;
};

beforeEach(() => {
  jest.clearAllMocks();
  transaction = { id: 'tx-test' };
  sequelize.transaction.mockImplementation(async (callback) => callback(transaction));
  Produit.findByPk.mockResolvedValue({ id: ID_PRODUIT, increment: jest.fn(async () => null) });
  Produit.findAll.mockResolvedValue([{ id: ID_PRODUIT, stock: 12 }]);
  MouvementStock.count.mockResolvedValue(0);
  MouvementStock.bulkCreate.mockResolvedValue([]);
});

describe('traiterRetour', () => {
  it('remise en stock : incrément et mouvement dans la même transaction', async () => {
    const retour = retourFactice(false);
    Retour.findByPk.mockResolvedValue(retour);

    const resultat = await RetourService.traiterRetour(ID_RETOUR, {
      statut: 'accepte',
      remisEnStock: true,
      adminId: ID_ADMIN,
    });

    expect(resultat.success).toBe(true);
    const produit = await Produit.findByPk.mock.results[0].value;
    expect(produit.increment).toHaveBeenCalledWith('stock', { by: 2, transaction });

    const [lignes, options] = MouvementStock.bulkCreate.mock.calls[0];
    expect(options).toEqual({ transaction, ignoreDuplicates: true });
    expect(lignes[0]).toMatchObject({
      produitId: ID_PRODUIT,
      type: 'retour',
      source: 'retour_remise_en_stock',
      ancienneQuantite: 10,
      nouvelleQuantite: 12,
      difference: 2,
      retourId: ID_RETOUR,
      commandeId: ID_COMMANDE,
      clientId: ID_CLIENT,
      auteurId: ID_ADMIN,
    });
  });

  it('remise déjà faite : ni stock ni mouvement une seconde fois', async () => {
    Retour.findByPk.mockResolvedValue(retourFactice(true));

    const resultat = await RetourService.traiterRetour(ID_RETOUR, {
      remisEnStock: true,
      adminId: ID_ADMIN,
    });

    expect(resultat.success).toBe(true);
    expect(Produit.findByPk).not.toHaveBeenCalled();
    expect(MouvementStock.bulkCreate).not.toHaveBeenCalled();
  });

  it('remise annulée : stock retiré et mouvement de correction', async () => {
    Retour.findByPk.mockResolvedValue(retourFactice(true));
    Produit.findAll.mockResolvedValue([{ id: ID_PRODUIT, stock: 10 }]);
    MouvementStock.count.mockResolvedValue(1);

    await RetourService.traiterRetour(ID_RETOUR, { remisEnStock: false, adminId: ID_ADMIN });

    const produit = await Produit.findByPk.mock.results[0].value;
    expect(produit.increment).toHaveBeenCalledWith('stock', { by: -2, transaction });
    expect(MouvementStock.bulkCreate.mock.calls[0][0][0]).toMatchObject({
      type: 'ajustement_negatif',
      source: 'retour_correction',
      difference: -2,
      cleIdempotence: `retour:${ID_RETOUR}:correction:1`,
    });
  });

  it('changement de statut seul : le stock ne bouge pas, rien n’est tracé', async () => {
    Retour.findByPk.mockResolvedValue(retourFactice(false));

    await RetourService.traiterRetour(ID_RETOUR, { statut: 'refuse', adminId: ID_ADMIN });

    expect(Produit.findByPk).not.toHaveBeenCalled();
    expect(MouvementStock.bulkCreate).not.toHaveBeenCalled();
  });

  it('retour introuvable : aucun mouvement', async () => {
    Retour.findByPk.mockResolvedValue(null);

    const resultat = await RetourService.traiterRetour(ID_RETOUR, { remisEnStock: true });

    expect(resultat.success).toBe(false);
    expect(MouvementStock.bulkCreate).not.toHaveBeenCalled();
  });

  it('produit disparu : le retour avance, aucun mouvement inventé', async () => {
    Retour.findByPk.mockResolvedValue(retourFactice(false));
    Produit.findByPk.mockResolvedValue(null);

    const resultat = await RetourService.traiterRetour(ID_RETOUR, { remisEnStock: true });

    expect(resultat.success).toBe(true);
    expect(MouvementStock.bulkCreate).not.toHaveBeenCalled();
  });
});
