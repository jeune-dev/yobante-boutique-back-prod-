/**
 * Ajustement manuel du stock d'un produit et lecture de son historique.
 *
 * Verrouille le contrat de `PATCH /admin/produits/:id/stock` : motif
 * obligatoire pris dans une liste fermée, précision exigée pour « autre »,
 * quantité entière positive, accès réservé à l'admin, mouvement écrit aux
 * bonnes valeurs dans la même transaction que le stock. Verrouille aussi
 * `GET /admin/produits/:id/mouvements-stock` : filtres, indicateurs, droits.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/models', () => ({
  Produit: { findByPk: jest.fn(), findAll: jest.fn(), findAndCountAll: jest.fn() },
  MouvementStock: {
    create: jest.fn(),
    bulkCreate: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
  },
  Commande: { findAll: jest.fn() },
  CommandeItem: { count: jest.fn(), findAndCountAll: jest.fn() },
  User: { findByPk: jest.fn(), findOne: jest.fn(), findAll: jest.fn() },
  Rayon: {},
  SousRayon: {},
  ProfilVendeur: {},
  RefreshToken: {},
  UserOtp: {},
  Adresse: {},
  sequelize: {
    transaction: jest.fn(),
    fn: jest.fn((f, c) => `${f}(${c})`),
    col: jest.fn((c) => c),
  },
}));

const { Produit, MouvementStock, Commande, CommandeItem, User, sequelize } =
  require('../../src/models');
const cache = require('../../src/config/cache');
const app = require('../../src/app');
const { jwtConfig } = require('../../src/config/security');

const ID_ADMIN = '11111111-1111-4111-8111-111111111111';
const ID_CLIENT = '22222222-2222-4222-8222-222222222222';
const ID_PRODUIT = '55555555-5555-4555-8555-555555555555';

const signer = (id, role) =>
  jwt.sign({ id, role, isActive: true }, jwtConfig.secret, { expiresIn: '1h' });

const tokenAdmin = () => signer(ID_ADMIN, 'ADMIN');
const tokenClient = () => signer(ID_CLIENT, 'CLIENT');

/** Produit en base, avec un `update` qui applique réellement la modification. */
const produitFactice = (stock = 10, stockAlloue = 3) => {
  const instance = {
    id: ID_PRODUIT,
    nom: 'Riz parfumé 5 kg',
    stock,
    stockAlloue,
    update: jest.fn(async (champs) => {
      Object.assign(instance, champs);
      return instance;
    }),
  };
  return instance;
};

const ajuster = (corps, token = tokenAdmin()) =>
  request(app)
    .patch(`/api/v1/admin/produits/${ID_PRODUIT}/stock`)
    .set('Authorization', `Bearer ${token}`)
    .send(corps);

const lireHistorique = (requete = '', token = tokenAdmin()) =>
  request(app)
    .get(`/api/v1/admin/produits/${ID_PRODUIT}/mouvements-stock${requete}`)
    .set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  jest.clearAllMocks();
  cache.clear();
  // `resetMocks: true` efface les implémentations posées dans la fabrique.
  User.findByPk.mockResolvedValue({
    id: ID_ADMIN,
    role: 'ADMIN',
    isActive: true,
    mustChangePassword: false,
  });
  User.findAll.mockResolvedValue([]);
  Commande.findAll.mockResolvedValue([]);
  CommandeItem.count.mockResolvedValue(0);
  MouvementStock.findAll.mockResolvedValue([]);
  MouvementStock.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
  // Transaction doublée : le callback est exécuté tel quel, avec un objet
  // transaction factice que le service se contente de transmettre.
  sequelize.transaction.mockImplementation(async (callback) => callback({ id: 'tx-test' }));
  sequelize.fn.mockImplementation((f, c) => `${f}(${c})`);
  sequelize.col.mockImplementation((c) => c);
  MouvementStock.create.mockImplementation(async (d) => ({ ...d, id: 'mvt-1' }));
});

describe('PATCH /api/v1/admin/produits/:id/stock — validation', () => {
  it('refuse une requête sans motif', async () => {
    Produit.findByPk.mockResolvedValue(produitFactice());

    const res = await ajuster({ quantite: 4 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/motif/i);
    expect(MouvementStock.create).not.toHaveBeenCalled();
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it('refuse un motif vide', async () => {
    Produit.findByPk.mockResolvedValue(produitFactice());

    const res = await ajuster({ quantite: 4, motif: '' });

    expect(res.status).toBe(400);
    expect(MouvementStock.create).not.toHaveBeenCalled();
  });

  it('refuse un motif hors de la liste proposée', async () => {
    Produit.findByPk.mockResolvedValue(produitFactice());

    const res = await ajuster({ quantite: 4, motif: 'parce que' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/liste/i);
    expect(MouvementStock.create).not.toHaveBeenCalled();
  });

  it('refuse « autre » sans précision', async () => {
    Produit.findByPk.mockResolvedValue(produitFactice());

    const res = await ajuster({ quantite: 4, motif: 'autre' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/précisez/i);
    expect(MouvementStock.create).not.toHaveBeenCalled();
  });

  it('accepte « autre » avec une précision', async () => {
    Produit.findByPk.mockResolvedValue(produitFactice(10));

    const res = await ajuster({
      quantite: 4,
      motif: 'autre',
      commentaire: 'Transfert vers la boutique de Thiès',
    });

    expect(res.status).toBe(200);
    expect(MouvementStock.create.mock.calls[0][0]).toMatchObject({
      motif: 'autre',
      commentaire: 'Transfert vers la boutique de Thiès',
    });
  });

  it('refuse une quantité négative', async () => {
    Produit.findByPk.mockResolvedValue(produitFactice());

    const res = await ajuster({ quantite: -1, motif: 'correction_inventaire' });

    expect(res.status).toBe(400);
    expect(MouvementStock.create).not.toHaveBeenCalled();
  });

  it('refuse une quantité décimale', async () => {
    Produit.findByPk.mockResolvedValue(produitFactice());

    const res = await ajuster({ quantite: 4.5, motif: 'correction_inventaire' });

    expect(res.status).toBe(400);
    expect(MouvementStock.create).not.toHaveBeenCalled();
  });

  it('refuse une quantité absente', async () => {
    Produit.findByPk.mockResolvedValue(produitFactice());

    const res = await ajuster({ motif: 'correction_inventaire' });

    expect(res.status).toBe(400);
    expect(MouvementStock.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/admin/produits/:id/stock — contrôle d’accès', () => {
  it('refuse une requête sans jeton', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/produits/${ID_PRODUIT}/stock`)
      .send({ quantite: 4, motif: 'correction_inventaire' });

    expect(res.status).toBe(401);
    expect(MouvementStock.create).not.toHaveBeenCalled();
  });

  it('refuse un compte non administrateur', async () => {
    const res = await ajuster({ quantite: 4, motif: 'correction_inventaire' }, tokenClient());

    expect(res.status).toBe(403);
    expect(MouvementStock.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/admin/produits/:id/stock — ajustement', () => {
  it('enregistre un mouvement avec les bonnes valeurs et met le stock à jour', async () => {
    const produit = produitFactice(10, 3);
    Produit.findByPk.mockResolvedValue(produit);

    const res = await ajuster({ quantite: 4, motif: 'perte_ou_casse' });

    expect(res.status).toBe(200);
    expect(produit.update).toHaveBeenCalledWith({ stock: 4 }, expect.anything());

    expect(MouvementStock.create).toHaveBeenCalledTimes(1);
    expect(MouvementStock.create.mock.calls[0][0]).toEqual({
      produitId: ID_PRODUIT,
      type: 'ajustement_negatif',
      source: 'ajustement_admin',
      ancienneQuantite: 10,
      nouvelleQuantite: 4,
      difference: -6,
      motif: 'perte_ou_casse',
      commentaire: null,
      auteurId: ID_ADMIN,
      commandeId: null,
      clientId: null,
      cleIdempotence: null,
    });
  });

  it('typifie un ajustement à la hausse', async () => {
    Produit.findByPk.mockResolvedValue(produitFactice(2));

    const res = await ajuster({ quantite: 20, motif: 'reapprovisionnement_fournisseur' });

    expect(res.status).toBe(200);
    expect(MouvementStock.create.mock.calls[0][0]).toMatchObject({
      type: 'ajustement_positif',
      ancienneQuantite: 2,
      nouvelleQuantite: 20,
      difference: 18,
    });
  });

  it('typifie un ajustement sans écart', async () => {
    Produit.findByPk.mockResolvedValue(produitFactice(7));

    await ajuster({ quantite: 7, motif: 'correction_inventaire' });

    expect(MouvementStock.create.mock.calls[0][0]).toMatchObject({
      type: 'ajustement_neutre',
      difference: 0,
    });
  });

  it("ignore un auteur fourni dans le corps : il vient du jeton", async () => {
    Produit.findByPk.mockResolvedValue(produitFactice(10));

    await ajuster({
      quantite: 3,
      motif: 'erreur_comptage',
      auteurId: '99999999-9999-4999-8999-999999999999',
    });

    expect(MouvementStock.create.mock.calls[0][0].auteurId).toBe(ID_ADMIN);
  });

  it('ne touche pas à stockAlloue', async () => {
    const produit = produitFactice(10, 3);
    Produit.findByPk.mockResolvedValue(produit);

    await ajuster({ quantite: 0, motif: 'perte_ou_casse' });

    expect(produit.update.mock.calls[0][0]).toEqual({ stock: 0 });
    expect(produit.stockAlloue).toBe(3);
  });

  it('écrit le stock et le mouvement dans la même transaction', async () => {
    const produit = produitFactice(10);
    Produit.findByPk.mockResolvedValue(produit);

    await ajuster({ quantite: 7, motif: 'correction_inventaire' });

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    const transaction = { id: 'tx-test' };
    expect(Produit.findByPk).toHaveBeenCalledWith(ID_PRODUIT, { transaction, lock: true });
    expect(produit.update).toHaveBeenCalledWith({ stock: 7 }, { transaction });
    expect(MouvementStock.create).toHaveBeenCalledWith(expect.anything(), { transaction });
  });

  it('retourne 404 sur un produit introuvable, sans écrire de mouvement', async () => {
    Produit.findByPk.mockResolvedValue(null);

    const res = await ajuster({ quantite: 4, motif: 'correction_inventaire' });

    expect(res.status).toBe(404);
    expect(MouvementStock.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/admin/produits/:id/mouvements-stock', () => {
  const produitLu = { id: ID_PRODUIT, nom: 'Riz parfumé 5 kg', stock: 4, stockAlloue: 0 };

  it("retourne l'historique du plus récent au plus ancien, avec les indicateurs", async () => {
    Produit.findByPk.mockResolvedValue(produitLu);
    MouvementStock.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [
        {
          id: 'mvt-1',
          type: 'ajustement_negatif',
          source: 'ajustement_admin',
          ancienneQuantite: 10,
          nouvelleQuantite: 4,
          difference: -6,
          motif: 'perte_ou_casse',
          createdAt: '2026-10-23T10:00:00.000Z',
          auteur: { id: ID_ADMIN, nom: 'Beye', prenom: 'Balla', role: 'ADMIN' },
        },
      ],
    });
    MouvementStock.findAll.mockResolvedValue([
      { type: 'sortie', somme: '-12', nombre: '3' },
      { type: 'entree', somme: '5', nombre: '1' },
      { type: 'ajustement_negatif', somme: '-6', nombre: '1' },
      { type: 'ajustement_positif', somme: '9', nombre: '2' },
    ]);
    CommandeItem.count.mockResolvedValue(3);

    const res = await lireHistorique();

    expect(res.status).toBe(200);
    expect(res.body.data.mouvements).toHaveLength(1);
    expect(MouvementStock.findAndCountAll.mock.calls[0][0]).toMatchObject({
      where: { produitId: ID_PRODUIT },
      order: [['createdAt', 'DESC']],
    });
    expect(res.body.data.indicateurs).toEqual({
      stockActuel: 4,
      totalEntrees: 5,
      totalSorties: 12,
      totalAjustementsPositifs: 9,
      totalAjustementsNegatifs: 6,
      nombreCommandes: 3,
    });
  });

  it('applique les filtres de période et de type côté serveur', async () => {
    Produit.findByPk.mockResolvedValue(produitLu);

    const res = await lireHistorique('?dateDebut=2026-10-01&dateFin=2026-10-23&type=sortie');

    expect(res.status).toBe(200);
    const where = MouvementStock.findAndCountAll.mock.calls[0][0].where;
    expect(where.type).toBe('sortie');
    expect(where.createdAt).toBeDefined();
    // Les totaux portent sur le même ensemble filtré, pas sur la page.
    expect(MouvementStock.findAll.mock.calls[0][0].where).toEqual(where);
  });

  it('refuse un type de mouvement inconnu', async () => {
    const res = await lireHistorique('?type=teleportation');

    expect(res.status).toBe(400);
    expect(MouvementStock.findAndCountAll).not.toHaveBeenCalled();
  });

  it('refuse un motif inconnu', async () => {
    const res = await lireHistorique('?motif=parce-que');

    expect(res.status).toBe(400);
    expect(MouvementStock.findAndCountAll).not.toHaveBeenCalled();
  });

  it('résout la recherche libre en identifiants de commande et de client', async () => {
    Produit.findByPk.mockResolvedValue(produitLu);
    Commande.findAll.mockResolvedValue([{ id: 'cmd-1' }]);
    User.findAll.mockResolvedValue([{ id: 'usr-1' }]);

    const res = await lireHistorique('?search=CMD-42');

    expect(res.status).toBe(200);
    const where = MouvementStock.findAndCountAll.mock.calls[0][0].where;
    // `Op.or` / `Op.in` sont des symboles : on les relit via leurs clés.
    const valeurSymbole = (objet) => objet[Object.getOwnPropertySymbols(objet)[0]];
    const ou = valeurSymbole(where);
    expect(valeurSymbole(ou[0].commandeId)).toEqual(['cmd-1']);
    expect(valeurSymbole(ou[1].clientId)).toEqual(['usr-1']);
  });

  it('retourne 404 sur un produit introuvable', async () => {
    Produit.findByPk.mockResolvedValue(null);

    const res = await lireHistorique();

    expect(res.status).toBe(404);
  });

  it('refuse un compte non administrateur', async () => {
    const res = await lireHistorique('', tokenClient());

    expect(res.status).toBe(403);
    expect(MouvementStock.findAndCountAll).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/admin/produits/:id/commandes', () => {
  it('liste les commandes contenant le produit avec le prix figé de la ligne', async () => {
    Produit.findByPk.mockResolvedValue({ id: ID_PRODUIT, nom: 'Riz parfumé 5 kg' });
    CommandeItem.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [
        {
          id: 'li-1',
          quantite: 2,
          prixUnitaire: '4500.00',
          sousTotal: '9000.00',
          commande: {
            id: 'cmd-1',
            reference: 'CMD-42',
            statut: 'validee',
            createdAt: '2026-10-20T08:00:00.000Z',
            user: { id: ID_CLIENT, nom: 'Diop', prenom: 'Awa' },
          },
        },
      ],
    });

    const res = await request(app)
      .get(`/api/v1/admin/produits/${ID_PRODUIT}/commandes`)
      .set('Authorization', `Bearer ${tokenAdmin()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.lignes[0]).toMatchObject({
      quantite: 2,
      prixUnitaire: '4500.00',
      sousTotal: '9000.00',
    });
    expect(CommandeItem.findAndCountAll.mock.calls[0][0].where).toEqual({ produitId: ID_PRODUIT });
  });

  it('refuse un compte non administrateur', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/produits/${ID_PRODUIT}/commandes`)
      .set('Authorization', `Bearer ${tokenClient()}`);

    expect(res.status).toBe(403);
    expect(CommandeItem.findAndCountAll).not.toHaveBeenCalled();
  });
});
