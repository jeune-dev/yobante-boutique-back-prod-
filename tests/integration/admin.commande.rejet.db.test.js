/**
 * Rejet d'une commande depuis le dashboard admin — BASE POSTGRESQL RÉELLE.
 *
 * Vérifie en base : statut `rejetee`, `motifRejet` renseigné (lu par le
 * mobile via GET /commandes/:id), stock restauré une seule fois.
 *
 * Nécessite une base jetable, recréée à chaque exécution (sync force) :
 *   DB_IT=1 DB_HOST=localhost DB_PORT=55432 DB_USER=postgres DB_PASSWORD=
 *   DB_NAME=yobante_it npx jest tests/integration/admin.commande.rejet.db
 * Sans DB_IT=1, la suite est ignorée (la CI standard n'a pas de PostgreSQL).
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

const actif = process.env.DB_IT === '1';
const decrire = actif ? describe : describe.skip;

jest.mock('../../src/utils/mailer', () => ({
  sendMail: jest.fn(), sendOtpEmail: jest.fn(), sendWelcomeEmail: jest.fn(),
  sendResetPasswordEmail: jest.fn(), sendCommandeConfirmation: jest.fn(async () => null),
  sendCommandeStatut: jest.fn(async () => null), sendDemandeSuppressionCompteEmail: jest.fn(),
}));
jest.mock('../../src/services/resend.service', () => ({ sendEmail: jest.fn(), FROM: 'test' }));
jest.mock('../../src/services/notification/push/index', () => ({ pousser: jest.fn(), estConfigure: () => false }));

jest.setTimeout(60000);

decrire('PATCH /api/v1/admin/commandes/:id/rejeter — PostgreSQL réel', () => {
  let app, models, cache, secret;
  let admin, client, adresse, pA, pB;

  const jeton = (u) => jwt.sign({ id: u.id, role: u.role, isActive: true }, secret, { expiresIn: '1h' });
  const enAdmin = () => ({ Authorization: `Bearer ${jeton(admin)}` });
  const stock = async (p) => (await models.Produit.findByPk(p.id)).stock;
  const rejeter = (id, corps) =>
    request(app).patch(`/api/v1/admin/commandes/${id}/rejeter`).set(enAdmin()).send(corps);
  const nouvelleCommande = async () => {
    const res = await request(app).post('/api/v1/admin/commandes').set(enAdmin()).send({
      userId: client.id, adresseId: adresse.id, methode: 'cash_livraison',
      items: [{ produitId: pA.id, quantite: 3 }, { produitId: pB.id, quantite: 1 }],
    });
    expect(res.status).toBe(201);
    return res.body.data.commande;
  };

  beforeAll(async () => {
    models = require('../../src/models');
    cache = require('../../src/config/cache');
    app = require('../../src/app');
    secret = require('../../src/config/security').jwtConfig.secret;
    await models.sequelize.sync({ force: true });

    const U = (o) => models.User.create({ password: 'x'.repeat(60), isActive: true, isVerified: true, ...o });
    admin = await U({ nom: 'Admin', prenom: 'Test', email: 'admin@it.test', role: 'ADMIN' });
    client = await U({ nom: 'Sow', prenom: 'Fatou', email: 'fatou@it.test', role: 'CLIENT' });
    const vendeur = await U({ nom: 'Vendeur', prenom: 'V', email: 'vendeur@it.test', role: 'VENDEUR' });
    adresse = await models.Adresse.create({ userId: client.id, nomComplet: 'X', telephone: '770000000', rue: 'Rue 1', ville: 'Dakar', pays: 'Sénégal', isDefault: true });

    const P = (o) => models.Produit.create({ isActive: true, statutValidation: 'valide', vendeurId: vendeur.id, ...o });
    pA = await P({ nom: 'Produit A', slug: 'produit-a', prix: 5000, stock: 10 });
    pB = await P({ nom: 'Produit B', slug: 'produit-b', prix: 2000, stock: 5 });
  });

  beforeEach(() => cache.clear());
  afterAll(async () => {
    if (models) await models.sequelize.close();
  });

  it('{ motif } → rejetee + motifRejet en base, stock restauré, motif visible côté mobile', async () => {
    const stockA = await stock(pA);
    const stockB = await stock(pB);
    const commande = await nouvelleCommande();
    expect(await stock(pA)).toBe(stockA - 3);
    expect(await stock(pB)).toBe(stockB - 1);

    const res = await rejeter(commande.id, { motif: 'Stock insuffisant' });
    expect(res.status).toBe(200);

    const enBase = await models.Commande.findByPk(commande.id);
    expect(enBase.statut).toBe('rejetee');
    expect(enBase.motifRejet).toBe('Stock insuffisant');
    expect(await stock(pA)).toBe(stockA);
    expect(await stock(pB)).toBe(stockB);

    // Ce que lit le mobile (route client, inchangée).
    const mobile = await request(app).get(`/api/v1/commandes/${commande.id}`).set({ Authorization: `Bearer ${jeton(client)}` });
    expect(mobile.status).toBe(200);
    expect(mobile.body.data.commande).toMatchObject({ statut: 'rejetee', motifRejet: 'Stock insuffisant' });
  });

  it('{ raison } (alias) fonctionne aussi', async () => {
    const commande = await nouvelleCommande();
    const res = await rejeter(commande.id, { raison: 'Produit indisponible' });
    expect(res.status).toBe(200);
    expect((await models.Commande.findByPk(commande.id)).motifRejet).toBe('Produit indisponible');
  });

  it('second rejet de la même commande → 400, stock non restauré deux fois', async () => {
    const commande = await nouvelleCommande();
    expect((await rejeter(commande.id, { motif: 'Premier' })).status).toBe(200);
    const stockA = await stock(pA);

    const res = await rejeter(commande.id, { motif: 'Second' });
    expect(res.status).toBe(400);
    expect(await stock(pA)).toBe(stockA);
    expect((await models.Commande.findByPk(commande.id)).motifRejet).toBe('Premier');
  });

  it('deux rejets simultanés : un seul réussit, stock restauré une seule fois', async () => {
    const stockA = await stock(pA);
    const commande = await nouvelleCommande();
    const [r1, r2] = await Promise.all([
      rejeter(commande.id, { motif: 'Clic 1' }),
      rejeter(commande.id, { motif: 'Clic 2' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 400]);
    expect(await stock(pA)).toBe(stockA);
  });

  it('commande validée → 400, stock et statut intacts', async () => {
    const commande = await nouvelleCommande();
    expect((await request(app).patch(`/api/v1/admin/commandes/${commande.id}/valider`).set(enAdmin())).status).toBe(200);
    const stockA = await stock(pA);

    const res = await rejeter(commande.id, { motif: 'Trop tard' });
    expect(res.status).toBe(400);
    expect(await stock(pA)).toBe(stockA);
    expect((await models.Commande.findByPk(commande.id)).statut).toBe('validee');
  });

  it('sans motif → 400, commande inchangée', async () => {
    const commande = await nouvelleCommande();
    const res = await rejeter(commande.id, {});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Le motif du rejet est obligatoire/);
    expect((await models.Commande.findByPk(commande.id)).statut).toBe('en_attente');
  });
});
