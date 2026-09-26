/**
 * Création de commande depuis le dashboard admin — BASE POSTGRESQL RÉELLE.
 *
 * Aucune doublure de modèle : requêtes HTTP (supertest) → middlewares →
 * contrôleur → service commun → transaction → PostgreSQL, puis vérification
 * directe du contenu des tables après chaque cas (succès comme échec).
 *
 * Nécessite une base jetable, recréée à chaque exécution (sync force) :
 *   DB_IT=1 DB_HOST=localhost DB_PORT=55432 DB_USER=postgres DB_PASSWORD=
 *   DB_NAME=yobante_it npx jest tests/integration/admin.commande.creation.db
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

decrire('POST /api/v1/admin/commandes — PostgreSQL réel', () => {
  let app, models, cache, secret;
  let admin, client, clientInactif, autreClient, vendeur, adresse, adresseAutre, pA, pB, pInactif;

  const jeton = (u) => jwt.sign({ id: u.id, role: u.role, isActive: true }, secret, { expiresIn: '1h' });
  const enAdmin = () => ({ Authorization: `Bearer ${jeton(admin)}` });
  const creer = (corps, entetes = enAdmin()) => request(app).post('/api/v1/admin/commandes').set(entetes).send(corps);
  const stock = async (p) => (await models.Produit.findByPk(p.id)).stock;
  const nbCommandes = () => models.Commande.count();
  const nbLignes = () => models.CommandeItem.count();
  const nbPaiements = () => models.Paiement.count();

  const etatBase = async () => ({
    commandes: await nbCommandes(),
    lignes: await nbLignes(),
    paiements: await nbPaiements(),
    stockA: await stock(pA),
    stockB: await stock(pB),
  });

  beforeAll(async () => {
    models = require('../../src/models');
    cache = require('../../src/config/cache');
    app = require('../../src/app');
    secret = require('../../src/config/security').jwtConfig.secret;
    await models.sequelize.sync({ force: true });

    const U = (o) => models.User.create({ password: 'x'.repeat(60), isActive: true, isVerified: true, ...o });
    admin = await U({ nom: 'Admin', prenom: 'Test', email: 'admin@it.test', role: 'ADMIN' });
    client = await U({ nom: 'Sow', prenom: 'Fatou', email: 'fatou@it.test', role: 'CLIENT', telephone: '+221770000001' });
    autreClient = await U({ nom: 'Diop', prenom: 'Moussa', email: 'moussa@it.test', role: 'CLIENT' });
    clientInactif = await U({ nom: 'Inactif', prenom: 'X', email: 'inactif@it.test', role: 'CLIENT', isActive: false });
    vendeur = await U({ nom: 'Vendeur', prenom: 'V', email: 'vendeur@it.test', role: 'VENDEUR' });

    const A = (userId, ville) =>
      models.Adresse.create({ userId, nomComplet: 'X', telephone: '770000000', rue: 'Rue 1', ville, pays: 'Sénégal', isDefault: true });
    adresse = await A(client.id, 'Dakar');
    adresseAutre = await A(autreClient.id, 'Thiès');
    await models.FraisLivraison.create({ ville: 'Dakar', pays: 'Sénégal', montant: 1000, isActive: true });

    const P = (o) => models.Produit.create({ isActive: true, statutValidation: 'valide', vendeurId: vendeur.id, ...o });
    pA = await P({ nom: 'Produit A', slug: 'produit-a', prix: 5000, stock: 10 });
    pB = await P({ nom: 'Produit B', slug: 'produit-b', prix: 7500.5, stock: 3 });
    pInactif = await P({ nom: 'Produit C', slug: 'produit-c', prix: 100, stock: 10, isActive: false });
  });

  beforeEach(() => cache.clear());
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (models) await models.sequelize.close();
  });

  const corpsValide = (items) => ({ userId: client.id, adresseId: adresse.id, methode: 'cash_livraison', items });

  // ── Authentification / autorisation ─────────────────────────
  it('sans jeton → 401, rien en base', async () => {
    const avant = await etatBase();
    const res = await creer(corpsValide([{ produitId: pA.id, quantite: 1 }]), {});
    expect(res.status).toBe(401);
    expect(await etatBase()).toEqual(avant);
  });

  it.each([['CLIENT', () => client], ['VENDEUR', () => vendeur]])('jeton %s → 403', async (_r, qui) => {
    const res = await creer(corpsValide([{ produitId: pA.id, quantite: 1 }]), { Authorization: `Bearer ${jeton(qui())}` });
    expect(res.status).toBe(403);
    expect(await nbCommandes()).toBe(0);
  });

  // ── Validation ──────────────────────────────────────────────
  it.each([
    ['panier vide', { items: [] }, /au moins un produit/],
    ['sans items', { items: undefined }, /au moins un produit/],
    ['quantité 0', { items: [{ quantite: 0 }] }, /au moins 1/],
    ['quantité négative', { items: [{ quantite: -1 }] }, /au moins 1/],
    ['quantité texte', { items: [{ quantite: 'abc' }] }, /nombre entier/],
    ['quantité décimale', { items: [{ quantite: 1.5 }] }, /nombre entier/],
    ['quantité en chaîne', { items: [{ quantite: '2' }] }, /nombre entier/],
    ['sans client', { userId: undefined }, /sélectionner un client/],
    ['produit non UUID', { items: [{ produitId: 'abc', quantite: 1 }] }, /Produit invalide/],
  ])('%s → 400 avec message clair, base inchangée', async (_cas, surcharge, message) => {
    const avant = await etatBase();
    const corps = corpsValide([{ produitId: pA.id, quantite: 1 }]);
    if ('items' in surcharge) {
      corps.items = surcharge.items && surcharge.items.map((i) => ({ produitId: pA.id, ...i }));
    }
    if ('userId' in surcharge) corps.userId = surcharge.userId;
    const res = await creer(corps);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(message);
    expect(await etatBase()).toEqual(avant);
  });

  it('client inexistant → 404', async () => {
    const res = await creer({ ...corpsValide([{ produitId: pA.id, quantite: 1 }]), userId: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Client introuvable');
    expect(await nbCommandes()).toBe(0);
  });

  it('un compte non CLIENT (vendeur) ne peut pas être le client → 404', async () => {
    const res = await creer({ ...corpsValide([{ produitId: pA.id, quantite: 1 }]), userId: vendeur.id });
    expect(res.status).toBe(404);
  });

  it('client désactivé → 400', async () => {
    const res = await creer({ ...corpsValide([{ produitId: pA.id, quantite: 1 }]), userId: clientInactif.id });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/désactivé/);
  });

  it("adresse d'un autre client → 400 « Adresse introuvable »", async () => {
    const res = await creer({ ...corpsValide([{ produitId: pA.id, quantite: 1 }]), adresseId: adresseAutre.id });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Adresse introuvable');
    expect(await nbCommandes()).toBe(0);
  });

  it('produit inexistant → 404, base inchangée', async () => {
    const avant = await etatBase();
    const res = await creer(corpsValide([{ produitId: pA.id, quantite: 1 }, { produitId: '00000000-0000-4000-8000-00000000abcd', quantite: 1 }]));
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/introuvable/);
    expect(await etatBase()).toEqual(avant);
  });

  it('produit désactivé → 400', async () => {
    const res = await creer(corpsValide([{ produitId: pInactif.id, quantite: 1 }]));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/n'est plus disponible/);
  });

  // ── Stock et transaction ────────────────────────────────────
  it('stock insuffisant → 400 avec le stock disponible, aucune commande, stock intact', async () => {
    const avant = await etatBase();
    const res = await creer(corpsValide([{ produitId: pB.id, quantite: 7 }]));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Stock insuffisant pour "Produit B" (disponible : 3, demandé : 7)');
    expect(await etatBase()).toEqual(avant);
  });

  it('échec sur le 2e produit : la décrémentation du 1er est annulée (ROLLBACK)', async () => {
    const avant = await etatBase();
    const res = await creer(corpsValide([{ produitId: pA.id, quantite: 2 }, { produitId: pB.id, quantite: 4 }]));
    expect(res.status).toBe(400);
    expect(await etatBase()).toEqual(avant);
  });

  it('erreur base de données en cours de transaction → 500 générique, rien de partiel', async () => {
    const avant = await etatBase();
    jest.spyOn(models.CommandeItem, 'bulkCreate').mockRejectedValueOnce(new Error('panne SQL simulée'));
    // Le masquage du détail technique est le comportement de production.
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let res;
    try {
      res = await creer(corpsValide([{ produitId: pA.id, quantite: 1 }]));
    } finally {
      process.env.NODE_ENV = env;
    }
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/panne SQL|stack|sequelize/i);
    expect(await etatBase()).toEqual(avant);
  });

  // ── Cas nominal ─────────────────────────────────────────────
  it('création : prix relus en base, doublons fusionnés, totaux, stock, paiement, statut initial', async () => {
    await models.Panier.create({ userId: client.id, produitId: pA.id, quantite: 1 });
    const avant = await etatBase();

    const res = await creer({
      ...corpsValide([
        { produitId: pA.id, quantite: 2, prix: 1 }, // prix envoyé : ignoré
        { produitId: pB.id, quantite: 1 },
        { produitId: pA.id, quantite: 1 }, // doublon
      ]),
      methode: 'wave',
      note: 'Livrer le matin',
      dateLivraisonSouhaitee: '2026-12-01',
      montantTotal: 1, // ignoré
    });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Commande créée avec succès');
    const { commande } = res.body.data;
    expect(commande.produit?.prixAchat).toBeUndefined();

    // Vérification directe en base.
    const c = await models.Commande.findByPk(commande.id, { include: [{ model: models.CommandeItem, as: 'items' }, { model: models.Paiement, as: 'paiement' }] });
    expect(c).not.toBeNull();
    expect(c.userId).toBe(client.id);
    expect(c.adresseId).toBe(adresse.id);
    expect(c.statut).toBe('en_attente');
    expect(c.note).toBe('Livrer le matin');
    expect(c.dateLivraisonSouhaitee).toBe('2026-12-01');
    expect(Number(c.fraisLivraison)).toBe(1000); // tarif Dakar
    // 3 × 5000 + 1 × 7500.50 + 1000 de livraison
    expect(Number(c.montantTotal)).toBe(23500.5);
    expect(c.items).toHaveLength(2);
    const ligne = (p) => c.items.find((i) => i.produitId === p.id);
    expect(ligne(pA)).toMatchObject({ quantite: 3 });
    expect(Number(ligne(pA).prixUnitaire)).toBe(5000);
    expect(Number(ligne(pA).sousTotal)).toBe(15000);
    expect(Number(ligne(pB).prixUnitaire)).toBe(7500.5);
    expect(Number(ligne(pB).sousTotal)).toBe(7500.5);
    expect(c.paiement).toMatchObject({ methode: 'wave', statut: 'en_attente', userId: client.id });
    expect(Number(c.paiement.montant)).toBe(23500.5);

    expect(await stock(pA)).toBe(avant.stockA - 3);
    expect(await stock(pB)).toBe(avant.stockB - 1);
    // Le panier du client (mobile) n'est pas touché par une commande admin.
    expect(await models.Panier.count({ where: { userId: client.id } })).toBe(1);

    // Visible dans la liste admin réelle, et retrouvable par sa référence.
    const liste = await request(app).get('/api/v1/admin/commandes').set(enAdmin()).query({ search: commande.reference.slice(4, 14), statut: '', page: 1, limit: 20 });
    expect(liste.status).toBe(200);
    expect(liste.body.data.commandes.map((x) => x.id)).toContain(commande.id);
    const detail = await request(app).get(`/api/v1/admin/commandes/${commande.id}`).set(enAdmin());
    expect(detail.status).toBe(200);
    expect(detail.body.data.commande.user.password).toBeUndefined();
  });

  it('double soumission simultanée : une seule commande créée, la seconde reçoit 429', async () => {
    const original = models.CommandeItem.bulkCreate.bind(models.CommandeItem);
    jest.spyOn(models.CommandeItem, 'bulkCreate').mockImplementation(async (...args) => {
      await new Promise((r) => setTimeout(r, 400)); // transaction volontairement longue
      return original(...args);
    });
    const avant = await nbCommandes();
    const stockAvant = await stock(pA);
    const corps = corpsValide([{ produitId: pA.id, quantite: 1 }]);
    const [r1, r2] = await Promise.all([creer(corps), creer(corps)]);
    expect([r1.status, r2.status].sort()).toEqual([201, 429]);
    expect(await nbCommandes()).toBe(avant + 1);
    expect(await stock(pA)).toBe(stockAvant - 1);
  });

  it('le verrou est libéré : une commande suivante pour le même client passe', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await creer(corpsValide([{ produitId: pA.id, quantite: 1 }]));
      expect(res.status).toBe(201);
    }
  });

  // ── Liste / détail robustes ─────────────────────────────────
  it('GET /admin/commandes/nouveau → 404 (et non 500)', async () => {
    const res = await request(app).get('/api/v1/admin/commandes/nouveau').set(enAdmin());
    expect(res.status).toBe(404);
  });

  it('GET liste avec les paramètres envoyés par le dashboard → 200', async () => {
    const res = await request(app).get('/api/v1/admin/commandes?search=&statut=&page=1&limit=20').set(enAdmin());
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(await nbCommandes());
  });

  // ── Adresses du client (admin) ──────────────────────────────
  it('adresses du client : liste, ajout, client inconnu', async () => {
    const liste = await request(app).get(`/api/v1/admin/users/clients/${client.id}/adresses`).set(enAdmin());
    expect(liste.status).toBe(200);
    expect(liste.body.data.adresses.map((a) => a.id)).toContain(adresse.id);

    const ajout = await request(app).post(`/api/v1/admin/users/clients/${autreClient.id}/adresses`).set(enAdmin())
      .send({ nomComplet: 'Moussa Diop', telephone: '771112233', rue: 'Rue 5', ville: 'Dakar' });
    expect(ajout.status).toBe(201);
    expect(await models.Adresse.count({ where: { userId: autreClient.id } })).toBe(2);

    const invalide = await request(app).post(`/api/v1/admin/users/clients/${autreClient.id}/adresses`).set(enAdmin()).send({ rue: 'x' });
    expect(invalide.status).toBe(400);

    const inconnu = await request(app).get('/api/v1/admin/users/clients/nouveau/adresses').set(enAdmin());
    expect(inconnu.status).toBe(404);
    const refuse = await request(app).get(`/api/v1/admin/users/clients/${client.id}/adresses`).set({ Authorization: `Bearer ${jeton(client)}` });
    expect(refuse.status).toBe(403);
  });

  // ── Non-régression mobile ───────────────────────────────────
  it('mobile : POST /commandes fonctionne toujours (logique commune) et vide le panier', async () => {
    await models.Panier.destroy({ where: { userId: autreClient.id } });
    await models.Panier.create({ userId: autreClient.id, produitId: pA.id, quantite: 1 });
    const adr = await models.Adresse.findOne({ where: { userId: autreClient.id, ville: 'Thiès' } });
    const stockAvant = await stock(pA);
    const res = await request(app).post('/api/v1/commandes').set({ Authorization: `Bearer ${jeton(autreClient)}` })
      .send({ adresseId: adr.id, methode: 'cash_livraison', items: [{ produitId: pA.id, quantite: 2 }] });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Commande passée avec succès');
    expect(res.body.data.commande.statut).toBe('en_attente');
    expect(res.body.data.commande.items[0].produit.prixAchat).toBeUndefined();
    expect(await stock(pA)).toBe(stockAvant - 2);
    expect(await models.Panier.count({ where: { userId: autreClient.id } })).toBe(0);

    // Une 2e commande du même client juste après (verrou bien libéré).
    const res2 = await request(app).post('/api/v1/commandes').set({ Authorization: `Bearer ${jeton(autreClient)}` })
      .send({ adresseId: adr.id, methode: 'cash_livraison', items: [{ produitId: pA.id, quantite: 1 }] });
    expect(res2.status).toBe(201);
    const mes = await request(app).get('/api/v1/commandes').set({ Authorization: `Bearer ${jeton(autreClient)}` });
    expect(mes.status).toBe(200);
    expect(mes.body.data.commandes).toHaveLength(2);
  });
});
