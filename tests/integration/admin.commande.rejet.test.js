/**
 * PATCH /api/v1/admin/commandes/:id/rejeter — contrat dashboard ↔ backend.
 *
 * Le dashboard envoie `{ motif }` ; `raison` (ancien nom) reste accepté.
 * Règle métier (commune avec CommandeService) : seule une commande en attente
 * peut être rejetée → statut `rejetee`, motif dans `motifRejet` (affiché par
 * le mobile), stock restauré dans la transaction.
 *
 * Modèles doublés : la même vérification sur PostgreSQL réel est dans
 * admin.commande.rejet.db.test.js (DB_IT=1).
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/models', () => {
  const stub = () => ({
    findOne: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(async () => []),
    findAndCountAll: jest.fn(async () => ({ rows: [], count: 0 })), count: jest.fn(async () => 0),
    create: jest.fn(), update: jest.fn(), destroy: jest.fn(), increment: jest.fn(async () => null),
    sum: jest.fn(async () => 0), max: jest.fn(async () => 0),
  });
  const transaction = { commit: jest.fn(), rollback: jest.fn() };
  return {
    User: stub(), ProfilVendeur: stub(), Produit: stub(), Commande: stub(), CommandeItem: stub(),
    Categorie: stub(), Rayon: stub(), SousRayon: stub(), Banniere: stub(), BlocPromo: stub(),
    Promotion: stub(), Avis: stub(), Paiement: stub(), FraisLivraison: stub(), RefreshToken: stub(),
    UserOtp: stub(), Adresse: stub(), Notification: stub(), DeviceToken: stub(), Message: stub(),
    Favori: stub(), Panier: stub(), BanniereProduit: stub(), DemandeSuppressionCompte: stub(),
    sequelize: { transaction: jest.fn(async () => transaction), query: jest.fn(async () => []), literal: jest.fn(), fn: jest.fn(), col: jest.fn(), QueryTypes: { SELECT: 'SELECT' } },
  };
});
jest.mock('../../src/utils/mailer', () => ({
  sendMail: jest.fn(), sendOtpEmail: jest.fn(), sendWelcomeEmail: jest.fn(),
  sendResetPasswordEmail: jest.fn(), sendCommandeConfirmation: jest.fn(async () => null),
  sendCommandeStatut: jest.fn(async () => null), sendDemandeSuppressionCompteEmail: jest.fn(),
}));
jest.mock('../../src/services/resend.service', () => ({ sendEmail: jest.fn(), FROM: 'test' }));

const { User, Commande, Produit, sequelize } = require('../../src/models');
const { sendCommandeStatut } = require('../../src/utils/mailer');
const cache = require('../../src/config/cache');
const app = require('../../src/app');
const { jwtConfig } = require('../../src/config/security');

const ID = {
  ADMIN: '10000000-0000-4000-8000-000000000001',
  CLIENT: '10000000-0000-4000-8000-000000000003',
  COMMANDE: '20000000-0000-4000-8000-000000000001',
  PA: '30000000-0000-4000-8000-000000000001',
  PB: '30000000-0000-4000-8000-000000000002',
};
const COMPTES = {
  [ID.ADMIN]: { id: ID.ADMIN, role: 'ADMIN', isActive: true, mustChangePassword: false },
  [ID.CLIENT]: { id: ID.CLIENT, role: 'CLIENT', isActive: true, mustChangePassword: false, email: 'fatou@it.test' },
};
const jeton = (id, role) => jwt.sign({ id, role, isActive: true }, jwtConfig.secret, { expiresIn: '1h' });
const enAdmin = { Authorization: `Bearer ${jeton(ID.ADMIN, 'ADMIN')}` };
const rejeter = (corps, entetes = enAdmin, id = ID.COMMANDE) =>
  request(app).patch(`/api/v1/admin/commandes/${id}/rejeter`).set(entetes).send(corps);

describe('PATCH /api/v1/admin/commandes/:id/rejeter', () => {
  let commande;
  let transaction;

  beforeEach(() => {
    // jest.config : resetMocks → les doublures sont redéfinies à chaque test.
    cache.clear();
    transaction = { commit: jest.fn(), rollback: jest.fn() };
    sequelize.transaction.mockResolvedValue(transaction);
    Produit.increment.mockResolvedValue(null);
    sendCommandeStatut.mockResolvedValue(null);
    commande = {
      id: ID.COMMANDE,
      reference: 'CMD-TEST',
      userId: ID.CLIENT,
      statut: 'en_attente',
      motifRejet: null,
      items: [
        { produitId: ID.PA, quantite: 3 },
        { produitId: ID.PB, quantite: 1 },
      ],
    };
    User.findByPk.mockImplementation(async (id) => COMPTES[id] || null);
    Commande.findByPk.mockImplementation(async (id) => (id === ID.COMMANDE ? { ...commande } : null));
    // Mise à jour conditionnelle (where statut = en_attente), comme en SQL.
    Commande.update.mockImplementation(async (valeurs, { where }) => {
      if (where.id !== commande.id || where.statut !== commande.statut) return [0];
      Object.assign(commande, valeurs);
      return [1];
    });
  });

  const stockRestaure = () =>
    Produit.increment.mock.calls.map(([champ, { by, where, transaction: t }]) => ({
      champ, by, produitId: where.id, dansTransaction: t === transaction,
    }));

  it('{ motif } (contrat du dashboard) → 200, rejetee + motifRejet, stock restauré, email', async () => {
    const res = await rejeter({ motif: '  Stock insuffisant  ' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Commande rejetée avec succès');
    expect(res.body.data.commande).toMatchObject({ statut: 'rejetee', motifRejet: 'Stock insuffisant' });

    expect(Commande.update).toHaveBeenCalledWith(
      { statut: 'rejetee', motifRejet: 'Stock insuffisant' },
      expect.objectContaining({ where: { id: ID.COMMANDE, statut: 'en_attente' }, transaction })
    );
    expect(stockRestaure()).toEqual([
      { champ: 'stock', by: 3, produitId: ID.PA, dansTransaction: true },
      { champ: 'stock', by: 1, produitId: ID.PB, dansTransaction: true },
    ]);
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(sendCommandeStatut).toHaveBeenCalledWith('fatou@it.test', expect.objectContaining({ id: ID.COMMANDE }), 'rejetee');
  });

  it('{ raison } (ancien nom) reste accepté comme alias de motif', async () => {
    const res = await rejeter({ raison: 'Produit indisponible' });
    expect(res.status).toBe(200);
    expect(commande).toMatchObject({ statut: 'rejetee', motifRejet: 'Produit indisponible' });
    expect(Produit.increment).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['corps vide', {}],
    ['motif vide', { motif: '' }],
    ['motif blanc', { motif: '   ' }],
  ])('%s → 400 « Le motif du rejet est obligatoire », rien modifié', async (_cas, corps) => {
    const res = await rejeter(corps);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Le motif du rejet est obligatoire/);
    expect(Commande.update).not.toHaveBeenCalled();
    expect(Produit.increment).not.toHaveBeenCalled();
  });

  it('motif de plus de 500 caractères → 400', async () => {
    const res = await rejeter({ motif: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/500 caractères/);
  });

  it.each(['validee', 'expediee', 'livree', 'annulee', 'rejetee'])(
    'commande %s → 400, stock intact',
    async (statut) => {
      commande.statut = statut;
      const res = await rejeter({ motif: 'Trop tard' });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Seule une commande en attente peut être rejetée');
      expect(Produit.increment).not.toHaveBeenCalled();
      expect(sendCommandeStatut).not.toHaveBeenCalled();
    }
  );

  it('rejet concurrent (statut changé entre lecture et écriture) → 400, stock non restauré deux fois', async () => {
    const lu = { ...commande }; // lu « en_attente »
    Commande.findByPk.mockImplementationOnce(async () => lu);
    commande.statut = 'rejetee'; // … mais déjà rejetée par la requête concurrente
    const res = await rejeter({ motif: 'Double clic' });
    expect(res.status).toBe(400);
    expect(Produit.increment).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
  });

  it('commande inexistante → 404', async () => {
    const res = await rejeter({ motif: 'x' }, enAdmin, '20000000-0000-4000-8000-00000000ffff');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Commande introuvable');
  });

  it('jeton CLIENT → 403, rien modifié', async () => {
    const res = await rejeter({ motif: 'x' }, { Authorization: `Bearer ${jeton(ID.CLIENT, 'CLIENT')}` });
    expect(res.status).toBe(403);
    expect(Commande.update).not.toHaveBeenCalled();
  });
});
