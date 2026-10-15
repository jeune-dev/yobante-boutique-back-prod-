// tests/unit/services/statutCommande.test.js
// Statuts de commande : choix de l'administration, notification du client,
// statut interne « en_modification » invisible du client et du vendeur.

const { statutPublic, commandePublique, statutsReels } = require('../../../src/utils/statutCommande');

describe('statut interne « en_modification »', () => {
  test('montré « en_attente » au client et au vendeur', () => {
    expect(statutPublic('en_modification')).toBe('en_attente');
    expect(statutPublic('validee')).toBe('validee');
    expect(commandePublique({ id: 'c1', statut: 'en_modification' }).statut).toBe('en_attente');
  });

  test('« en attente » couvre les commandes en modification', () => {
    expect(statutsReels('en_attente')).toEqual(['en_attente', 'en_modification']);
    expect(statutsReels('livree')).toEqual(['livree']);
  });
});

describe('changement de statut par l’administration', () => {
  let commande;
  const mockModels = {
    Commande: {
      scope: () => ({ findByPk: jest.fn(async () => commande) }),
    },
    CommandeItem: {},
    Produit: {},
    User: {},
    Adresse: {},
    Paiement: {},
    AcceptationCommande: {},
    sequelize: {},
  };
  const mockEmettre = jest.fn();
  const mockMail = jest.fn();

  let Service;
  beforeAll(() => {
    jest.resetModules();
    jest.doMock('../../../src/models', () => mockModels);
    jest.doMock('../../../src/services/notification', () => ({ emettre: (...a) => mockEmettre(...a) }));
    jest.doMock('../../../src/utils/mailer', () => ({
      sendCommandeStatut: (...a) => mockMail(...a),
      sendRuptureStock: jest.fn(),
    }));
    Service = require('../../../src/services/admin/commande.service');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    commande = {
      id: 'c1',
      reference: 'CMD-1',
      statut: 'en_attente',
      userId: 'u1',
      user: { email: 'client@example.com' },
    };
    commande.update = jest.fn(async (maj) => Object.assign(commande, maj));
  });

  test('« en modification » apparaît avant la validation', () => {
    expect(Service.statutsPossibles('en_attente')).toEqual(['en_modification', 'validee']);
    expect(Service.statutsPossibles('en_modification')).toEqual(['en_attente', 'validee']);
  });

  test('passage en modification : client NON prévenu (statut interne)', async () => {
    const r = await Service.changerStatut('c1', 'en_modification');
    expect(r.success).toBe(true);
    expect(commande.statut).toBe('en_modification');
    expect(mockEmettre).not.toHaveBeenCalled();
    expect(mockMail).not.toHaveBeenCalled();
  });

  test('validation : client prévenu (notification + email)', async () => {
    commande.statut = 'en_modification';
    const r = await Service.changerStatut('c1', 'validee');
    expect(r.success).toBe(true);
    expect(mockEmettre).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', type: 'commande_validee', titre: 'Commande validée' })
    );
    expect(mockMail).toHaveBeenCalledWith('client@example.com', commande, 'validee');
  });

  test('chaque étape suivante prévient le client', async () => {
    commande.statut = 'expediee';
    await Service.changerStatut('c1', 'livree');
    expect(mockEmettre).toHaveBeenCalledWith(expect.objectContaining({ type: 'commande_livree' }));
  });

  test('transition impossible refusée', async () => {
    commande.statut = 'en_attente';
    const r = await Service.changerStatut('c1', 'livree');
    expect(r).toMatchObject({ success: false, status: 400 });
    expect(commande.update).not.toHaveBeenCalled();
  });
});
