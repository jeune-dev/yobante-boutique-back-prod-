/**
 * CONTRAT API MOBILE ↔ BACKEND
 *
 * Pour chaque endpoint appelé par l'application Flutter, ce test :
 *  1. envoie EXACTEMENT ce que le mobile envoie (méthode, chemin, corps,
 *     paramètres, en-têtes) ;
 *  2. vérifie le code HTTP et l'enveloppe uniforme
 *     { success: boolean, message: string, data: object|null } ;
 *  3. vérifie les clés de `data` que les modèles Flutter lisent ;
 *  4. enregistre la réponse dans tests/contract/fixtures/<nom>.json.
 *
 * Les fixtures sont recopiées dans le dépôt mobile
 * (test/contract/fixtures/) où `contrat_api_test.dart` les fait parser par
 * les vrais modèles Dart : si le backend change une clé, une structure ou un
 * type, c'est ici que ça casse — pas chez l'utilisateur.
 *
 * Aucune base de données : les modèles Sequelize sont les vrais, mais leurs
 * méthodes statiques sont doublées pour construire des instances à partir
 * des `include` demandés par le service (la sérialisation `toJSON` reste
 * donc celle de la production, DECIMAL en chaîne compris).
 */
/* eslint-disable require-await -- doublures asynchrones sans I/O */
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

jest.mock('../../src/services/resend.service', () => ({ sendEmail: jest.fn(async () => ({ success: true })), FROM: 'test' }));
jest.mock('../../src/utils/mailer', () => ({
  sendMail: jest.fn(), sendOtpEmail: jest.fn(), sendWelcomeEmail: jest.fn(),
  sendResetPasswordEmail: jest.fn(), sendCommandeConfirmation: jest.fn(), sendCommandeStatut: jest.fn(),
  sendDemandeSuppressionCompteEmail: jest.fn(),
}));
jest.mock('../../src/services/r2.service', () => ({
  uploadImage: jest.fn(async () => 'https://cdn.exemple/image.jpg'), deleteImage: jest.fn(),
}));
jest.mock('../../src/services/upload.service', () => ({
  uploadImage: jest.fn(async () => 'https://cdn.exemple/image.jpg'), deleteImage: jest.fn(),
}));
jest.mock('../../src/services/notification/push/index', () => ({ pousser: jest.fn(), estConfigure: () => false }));
jest.mock('../../src/services/paiement/index', () => ({
  resoudreFournisseur: () => ({
    nom: 'wave',
    initier: async () => ({ reference: 'TX-TEST-001', urlPaiement: 'https://pay.exemple/TX-TEST-001' }),
    verifier: async () => ({ statut: 'en_attente' }),
  }),
}));

const models = require('../../src/models');
const { sequelize } = models;
const cache = require('../../src/config/cache');
const app = require('../../src/app');
const { jwtConfig } = require('../../src/config/security');

const FIXTURES = path.join(__dirname, 'fixtures');
const ID = {
  client: '10000000-0000-4000-8000-000000000001',
  vendeur: '10000000-0000-4000-8000-000000000002',
  produit: '20000000-0000-4000-8000-000000000001',
  commande: '30000000-0000-4000-8000-000000000001',
  adresse: '40000000-0000-4000-8000-000000000001',
  avis: '50000000-0000-4000-8000-000000000001',
  rayon: '60000000-0000-4000-8000-000000000001',
  sousRayon: '60000000-0000-4000-8000-000000000002',
  bloc: '70000000-0000-4000-8000-000000000001',
  message: '80000000-0000-4000-8000-000000000001',
  notification: '90000000-0000-4000-8000-000000000001',
};
const DATE = '2026-09-20T10:00:00.000Z';
const HASH = bcrypt.hashSync('Secret123', 4);

// ── Échantillons par modèle (valeurs plausibles, typées comme en prod) ──
const SURCHARGES = {
  User: { id: ID.client, nom: 'Sow', prenom: 'Fatou', email: 'fatou@exemple.com', telephone: '+221771234567', role: 'CLIENT', isActive: true, isVerified: true, password: HASH, mustChangePassword: false, avatar: null },
  Produit: { id: ID.produit, nom: 'Huile de palme', slug: 'huile-de-palme', prix: '1500.00', prixPromo: null, stock: 12, stockAlloue: 20, images: ['https://cdn.exemple/p.jpg'], isActive: true, statutValidation: 'valide', vendeurId: ID.vendeur, rayonId: ID.rayon, sousRayonId: ID.sousRayon, noteMoyenne: '4.50', nombreAvis: 2, venduAuPoids: false, etat: 'neuf', categorieId: null },
  Commande: { id: ID.commande, reference: 'CMD-2026-0001', userId: ID.client, adresseId: ID.adresse, statut: 'en_attente', montantTotal: '3000.00', fraisLivraison: '0.00', note: 'Sonner deux fois', dateLivraisonSouhaitee: '2026-10-01' },
  CommandeItem: { commandeId: ID.commande, produitId: ID.produit, quantite: 2, prixUnitaire: '1500.00', sousTotal: '3000.00' },
  Paiement: { commandeId: ID.commande, userId: ID.client, montant: '3000.00', methode: 'wave', statut: 'en_attente', transactionId: null, urlPaiement: null, payeAt: null },
  Adresse: { id: ID.adresse, userId: ID.client, nomComplet: 'Fatou Sow', telephone: '+221771234567', rue: 'Sicap Liberté 6', ville: 'Dakar', pays: 'Sénégal', isDefault: true },
  Avis: { id: ID.avis, userId: ID.client, produitId: ID.produit, note: 4, commentaire: 'Très bon produit', isApproved: true, reponseVendeur: null, reponduAt: null },
  ProfilVendeur: { userId: ID.vendeur, nomBoutique: 'Chez Moussa', description: 'Épicerie', adresseBoutique: 'Marché Sandaga', telephone: '+221765556677', logo: null, latitude: 14.67, longitude: -17.43, isActive: true },
  Rayon: { id: ID.rayon, nom: 'Alimentation', slug: 'alimentation', isActive: true, ordre: 1 },
  SousRayon: { id: ID.sousRayon, rayonId: ID.rayon, nom: 'Huiles', slug: 'huiles', isActive: true, ordre: 1 },
  Banniere: { titre: 'Rentrée', image: 'https://cdn.exemple/b.jpg', isActive: true },
  BlocPromo: { id: ID.bloc, section: 'nos_promos_du_moment', titre: 'Sélection', image: null, isActive: true, ordre: 0 },
  Promotion: { section: 'nos_promos_du_moment', blocPromoId: ID.bloc, produitId: ID.produit, prixPromo: '1200.00', pourcentageReduction: '20.00', dateDebut: DATE, dateFin: '2026-12-31T00:00:00.000Z', isActive: true, ordre: 0 },
  Message: { id: ID.message, expediteurId: ID.client, destinataireId: ID.vendeur, contenu: 'Bonjour', lu: false },
  Notification: { id: ID.notification, userId: ID.client, titre: 'Commande validée', corps: 'Votre commande CMD-2026-0001 est validée', lue: false, type: 'commande' },
  Favori: { userId: ID.client, boutiqueId: ID.vendeur },
  Categorie: { nom: 'Épicerie', slug: 'epicerie', isActive: true },
  DeviceToken: { userId: ID.client, token: 'fcm-token', plateforme: 'android' },
  RefreshToken: { userId: ID.client, expiresAt: '2027-01-01T00:00:00.000Z', revoked: false },
  UserOtp: { userId: ID.client, code: bcrypt.hashSync('ABCD1234', 4), type: 'reset_password', isUsed: false, expiresAt: '2027-01-01T00:00:00.000Z' },
};

/** Valeur d'exemple pour un attribut Sequelize, typée comme le renverrait PostgreSQL. */
function valeurPour(attr, nom) {
  const type = attr.type && attr.type.key;
  if (nom === 'id') return '00000000-0000-4000-8000-0000000000aa';
  if (nom === 'createdAt' || nom === 'updatedAt') return DATE;
  switch (type) {
    case 'UUID': return '00000000-0000-4000-8000-0000000000bb';
    case 'STRING': case 'TEXT': case 'CITEXT': return `${nom}-exemple`;
    case 'INTEGER': case 'BIGINT': return 1;
    case 'DECIMAL': return '10.00'; // PostgreSQL renvoie les DECIMAL en chaîne
    case 'FLOAT': case 'DOUBLE': case 'REAL': return 1.5;
    case 'BOOLEAN': return true;
    case 'DATE': return DATE;
    case 'ENUM': return attr.type.values[0];
    case 'JSON': case 'JSONB': return {};
    case 'ARRAY': return [];
    default: return null;
  }
}

const VENDEUR = { id: ID.vendeur, nom: 'Ndiaye', prenom: 'Moussa', email: 'moussa@exemple.com', role: 'VENDEUR', telephone: '+221765556677' };

function donnees(Model, surcharges = {}, attributes) {
  let d = {};
  for (const [nom, attr] of Object.entries(Model.rawAttributes)) d[nom] = valeurPour(attr, nom);
  d = { ...d, ...(SURCHARGES[Model.name] || {}), ...surcharges };
  // Le vendeur de test a sa propre identité (rôle VENDEUR).
  if (Model.name === 'User' && d.id === ID.vendeur) d = { ...d, ...VENDEUR };
  // `attributes` du service honoré : seules ces colonnes sont sérialisées
  // (c'est ainsi que la prod ne renvoie jamais `password` ni `email` du vendeur).
  if (Array.isArray(attributes)) {
    const garde = new Set([...attributes.map((a) => (Array.isArray(a) ? a[1] : a))]);
    d = Object.fromEntries(Object.entries(d).filter(([k]) => garde.has(k)));
  }
  return d;
}

/**
 * Données d'une association incluse. Un `User` rattaché comme `vendeur`, ou
 * porté par un `ProfilVendeur`, est le vendeur de test (et non le client).
 */
function inclus(Parent, assoc, attributes) {
  const Cible = assoc.target;
  const estVendeur = Cible.name === 'User' && (assoc.as === 'vendeur' || Parent.name === 'ProfilVendeur');
  return donnees(Cible, estVendeur ? { id: ID.vendeur } : {}, attributes);
}

/** Construit une instance réelle avec les `include` demandés par le service. */
function instance(Model, includes, surcharges) {
  const d = donnees(Model, surcharges);
  const specs = [];
  for (const inc of normaliser(includes)) {
    const assoc = (typeof inc.association === 'string' ? Model.associations[inc.association] : inc.association)
      || (inc.as ? Model.associations[inc.as] : Object.values(Model.associations).find((a) => a.target === inc.model));
    if (!assoc) continue;
    const Cible = assoc.target;
    const enfant = () => inclus(Model, assoc, inc.attributes);
    const nested = normaliser(inc.include);
    const construire = (obj) => {
      for (const n of nested) {
        const a2 = n.association || (n.as ? Cible.associations[n.as] : Object.values(Cible.associations).find((x) => x.target === n.model));
        if (!a2) continue;
        obj[a2.as] = a2.isMultiAssociation ? [inclus(Cible, a2, n.attributes)] : inclus(Cible, a2, n.attributes);
      }
      return obj;
    };
    d[assoc.as] = assoc.isMultiAssociation ? [construire(enfant())] : construire(enfant());
    specs.push({ association: assoc, include: nested.map((n) => ({ association: n.association || Cible.associations[n.as] || Object.values(Cible.associations).find((x) => x.target === n.model) })).filter((s) => s.association) });
  }
  const inst = Model.build(d, { include: specs, isNewRecord: false, raw: false });
  neutraliser(inst);
  return inst;
}
const normaliser = (inc) => (Array.isArray(inc) ? inc : inc ? [inc] : []);

/** Les mutations (instance racine ET instances incluses) ne touchent pas la base. */
function neutraliser(inst) {
  if (!inst || typeof inst !== 'object' || !inst.dataValues) return;
  inst.update = async (v) => { inst.set(v); return inst; };
  inst.save = async () => inst;
  inst.destroy = async () => 1;
  inst.reload = async () => inst;
  inst.increment = async () => inst;
  inst.decrement = async () => inst;
  for (const v of Object.values(inst.dataValues)) {
    if (Array.isArray(v)) v.forEach(neutraliser);
    else neutraliser(v);
  }
}

/** Doublure universelle des accès en base : jamais de requête, des instances réelles. */
function doubler() {
  for (const Model of Object.values(models)) {
    if (!Model || !Model.rawAttributes) continue;
    jest.spyOn(Model, 'findAll').mockImplementation(async (o = {}) => [instance(Model, o.include)]);
    jest.spyOn(Model, 'findOne').mockImplementation(async (o = {}) => instance(Model, o.include));
    jest.spyOn(Model, 'findByPk').mockImplementation(async (id, o = {}) => instance(Model, o.include, { id }));
    jest.spyOn(Model, 'findAndCountAll').mockImplementation(async (o = {}) => ({ rows: [instance(Model, o.include)], count: 1 }));
    jest.spyOn(Model, 'count').mockImplementation(async () => 1);
    jest.spyOn(Model, 'sum').mockImplementation(async () => 0);
    jest.spyOn(Model, 'max').mockImplementation(async () => 0);
    jest.spyOn(Model, 'create').mockImplementation(async (v = {}) => instance(Model, [], v));
    jest.spyOn(Model, 'bulkCreate').mockImplementation(async (rows = []) => rows.map((v) => instance(Model, [], v)));
    jest.spyOn(Model, 'findOrCreate').mockImplementation(async (o = {}) => [instance(Model, [], o.defaults), true]);
    jest.spyOn(Model, 'update').mockImplementation(async () => [1]);
    jest.spyOn(Model, 'destroy').mockImplementation(async () => 1);
  }
  jest.spyOn(sequelize, 'transaction').mockImplementation(async (fn) => {
    const t = { commit: async () => {}, rollback: async () => {}, LOCK: {} };
    return typeof fn === 'function' ? fn(t) : t;
  });
  jest.spyOn(sequelize, 'query').mockImplementation(async (sql = '') =>
    /pg_try_advisory_lock/.test(String(sql)) ? [{ pg_try_advisory_lock: true }] : []
  );
}

const jeton = (id, role) => jwt.sign({ id, role, isActive: true }, jwtConfig.secret, { expiresIn: '1h' });
const auth = (role = 'CLIENT') => ({ Authorization: `Bearer ${jeton(role === 'VENDEUR' ? ID.vendeur : ID.client, role)}` });

/**
 * Vérifie l'enveloppe uniforme et enregistre la fixture :
 * `{ requete: { methode, chemin, corps | champs }, reponse }`.
 * La requête (méthode, chemin, clés du corps JSON ou champs multipart) est
 * celle que ce backend a acceptée ; `test/contract/` côté Flutter vérifie que
 * les datasources envoient exactement la même chose et lisent `reponse`.
 */
function contrat(nom, res, { status = 200, cles = [], erreursChamps = false, champs = null } = {}) {
  expect(res.status).toBe(status);
  expect(typeof res.body.success).toBe('boolean');
  expect(res.body.success).toBe(status < 400);
  expect(typeof res.body.message).toBe('string');
  expect(res.body.message.length).toBeGreaterThan(0);
  expect('data' in res.body).toBe(true);
  if (status < 400) {
    // `data` est toujours un objet (jamais un tableau nu, jamais absent).
    expect(res.body.data).not.toBeNull();
    expect(Array.isArray(res.body.data)).toBe(false);
    expect(typeof res.body.data).toBe('object');
    for (const cle of cles) expect(res.body.data).toHaveProperty(cle);
    // Rien ne fuit : ni mot de passe, ni jeton hors login.
    expect(JSON.stringify(res.body)).not.toMatch(/"password"|\$2a\$/);
  } else if (erreursChamps) {
    // Seule exception documentée : la validation (400) détaille les champs
    // fautifs dans `data.errors` pour l'affichage formulaire côté mobile.
    expect(res.body.data).toEqual({ errors: expect.any(Array) });
    for (const e of res.body.data.errors) expect(e).toEqual({ champ: expect.any(String), message: expect.any(String) });
  } else {
    expect(res.body.data).toBeNull();
  }
  const url = new URL(res.request.url);
  const corps = res.request._data;
  const requete = {
    methode: res.request.method,
    chemin: url.pathname.replace(/^\/api\/v1/, ''),
    query: Object.fromEntries(url.searchParams),
    corps: champs ? null : corps && typeof corps === 'object' ? corps : null,
    champs,
  };
  fs.mkdirSync(FIXTURES, { recursive: true });
  fs.writeFileSync(path.join(FIXTURES, `${nom}.json`), JSON.stringify({ requete, reponse: res.body }, null, 2));
  return res.body.data;
}

beforeEach(() => {
  cache.clear();
  doubler();
  // `resetMocks: true` efface les implémentations des doublures de modules :
  // on redonne celles dont les services dépendent.
  require('../../src/services/r2.service').uploadImage.mockResolvedValue('https://cdn.exemple/image.jpg');
  require('../../src/services/upload.service').uploadImage.mockResolvedValue('https://cdn.exemple/image.jpg');
  const mailer = require('../../src/utils/mailer');
  for (const fn of Object.values(mailer)) if (jest.isMockFunction(fn)) fn.mockResolvedValue(undefined);
  require('../../src/services/resend.service').sendEmail.mockResolvedValue({ success: true });
});

describe('Contrat API mobile ↔ backend', () => {
  // ── Auth ─────────────────────────────────────────────────────
  it('POST /auth/register', async () => {
    models.User.findOne.mockResolvedValueOnce(null); // email libre
    const res = await request(app).post('/api/v1/auth/register').send({ nom: 'Sow', prenom: 'Fatou', email: 'fatou@exemple.com', password: 'Secret123', telephone: '+221771234567', adresse: { rue: 'Sicap' } });
    const d = contrat('auth_register', res, { status: 201, cles: ['user', 'messageTitle', 'messageDescription'] });
    expect(d.user).toMatchObject({ id: expect.any(String), email: expect.any(String), role: expect.any(String) });
  });

  it('POST /auth/login', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ identifiant: 'fatou@exemple.com', password: 'Secret123' });
    const d = contrat('auth_login', res, { cles: ['token', 'refreshToken', 'user', 'mustChangePassword'] });
    expect(typeof d.refreshToken).toBe('string'); // le mobile n'a pas de cookies
    expect(typeof d.mustChangePassword).toBe('boolean');
    expect(d.user).toMatchObject({ id: expect.any(String), nom: expect.any(String), prenom: expect.any(String), email: expect.any(String), role: expect.any(String), isActive: expect.any(Boolean) });
  });

  it('POST /auth/login — identifiants faux → 400', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ identifiant: 'fatou@exemple.com', password: 'faux' });
    contrat('auth_login_400', res, { status: 400 });
  });

  it('POST /auth/refresh', async () => {
    const refresh = jwt.sign({ id: ID.client, type: 'refresh' }, jwtConfig.refreshSecret, { expiresIn: '7d' });
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: refresh });
    contrat('auth_refresh', res, { cles: ['token', 'refreshToken'] });
  });

  it('POST /auth/logout', async () => {
    const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken: 'x' });
    contrat('auth_logout', res);
  });

  it('POST /auth/forgot-password', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'fatou@exemple.com' });
    contrat('auth_forgot_password', res);
  });

  it('POST /auth/reset-password', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password').send({ email: 'fatou@exemple.com', otp: 'ABCD1234', newPassword: 'Nouveau123' });
    contrat('auth_reset_password', res);
  });

  it('PUT /auth/change-password { oldPassword, newPassword }', async () => {
    const res = await request(app).put('/api/v1/auth/change-password').set(auth()).send({ oldPassword: 'Secret123', newPassword: 'Nouveau123' });
    contrat('auth_change_password', res);
  });

  it('POST /auth/changer-premier-mdp { ancienPassword, nouveauPassword, confirmPassword }', async () => {
    models.User.findByPk.mockImplementation(async (id, o = {}) => instance(models.User, o.include, { id, mustChangePassword: true }));
    const res = await request(app).post('/api/v1/auth/changer-premier-mdp').set(auth()).send({ ancienPassword: 'Secret123', nouveauPassword: 'Nouveau123', confirmPassword: 'Nouveau123' });
    contrat('auth_changer_premier_mdp', res);
  });

  it('sans jeton sur une route protégée → 401 avec l’enveloppe', async () => {
    const res = await request(app).get('/api/v1/profile');
    contrat('erreur_401', res, { status: 401 });
  });

  // ── Catalogue (public) ───────────────────────────────────────
  it('GET /produits?search=&vendeurId=&page=&limit=', async () => {
    const res = await request(app).get('/api/v1/produits').query({ search: 'huile', vendeurId: ID.vendeur, page: 1, limit: 20 });
    const d = contrat('produits_liste', res, { cles: ['produits', 'pagination'] });
    expect(d.pagination).toMatchObject({ total: expect.any(Number), totalPages: expect.any(Number), page: expect.any(Number), limit: expect.any(Number) });
    expect(d.produits[0]).toMatchObject({ id: expect.any(String), nom: expect.any(String), prix: expect.any(String), images: expect.any(Array), vendeur: expect.any(Object) });
    expect(d.produits[0].vendeur).toMatchObject({ id: expect.any(String), telephone: expect.any(String), profilVendeur: expect.any(Object) });
  });

  it('GET /produits/featured', async () => {
    const res = await request(app).get('/api/v1/produits/featured');
    contrat('produits_featured', res, { cles: ['produits'] });
  });

  it('GET /produits/recherche?q=', async () => {
    const res = await request(app).get('/api/v1/produits/recherche').query({ q: 'huile' });
    contrat('produits_recherche', res, { cles: ['produits', 'pagination'] });
  });

  it('GET /produits/:id/recommandes', async () => {
    const res = await request(app).get(`/api/v1/produits/${ID.produit}/recommandes`).query({ limit: 7 });
    contrat('produits_recommandes', res, { cles: ['produits'] });
  });

  it('GET /boutiques', async () => {
    const res = await request(app).get('/api/v1/boutiques');
    const d = contrat('boutiques_liste', res, { cles: ['boutiques'] });
    expect(d.boutiques[0]).toMatchObject({ id: expect.any(String), nom: expect.any(String), vendeur: { id: expect.any(String) } });
  });

  it('GET /acheteurs/boutiques-proches?lat&lng&rayon', async () => {
    sequelize.query.mockResolvedValueOnce([{ ...donnees(models.ProfilVendeur), distance: 1.2, user: donnees(models.User) }]);
    const res = await request(app).get('/api/v1/acheteurs/boutiques-proches').query({ lat: 14.7, lng: -17.4, rayon: 5 });
    contrat('boutiques_proches', res, { cles: ['boutiques'] });
  });

  it('GET /bannieres', async () => {
    const res = await request(app).get('/api/v1/bannieres');
    contrat('bannieres', res, { cles: ['bannieres'] });
  });

  it('GET /categories', async () => {
    const res = await request(app).get('/api/v1/categories');
    contrat('categories', res, { cles: ['categories'] });
  });

  it('GET /rayons', async () => {
    const res = await request(app).get('/api/v1/rayons');
    contrat('rayons', res, { cles: ['rayons'] });
  });

  it('GET /rayons/:id/produits', async () => {
    const res = await request(app).get(`/api/v1/rayons/${ID.rayon}/produits`).query({ page: 1, limit: 20 });
    contrat('rayon_produits', res, { cles: ['produits'] });
  });

  it('GET /rayons/sous-rayons/:id/produits', async () => {
    const res = await request(app).get(`/api/v1/rayons/sous-rayons/${ID.sousRayon}/produits`).query({ page: 1, limit: 20 });
    contrat('sous_rayon_produits', res, { cles: ['produits'] });
  });

  it('GET /promotions', async () => {
    contrat('promotions_sections', await request(app).get('/api/v1/promotions'), { cles: ['sections'] });
  });
  it('GET /promotions/actives', async () => {
    contrat('promotions_actives', await request(app).get('/api/v1/promotions/actives'), { cles: ['promotions'] });
  });
  it('GET /promotions/groupees', async () => {
    contrat('promotions_groupees', await request(app).get('/api/v1/promotions/groupees'), { cles: ['promotions'] });
  });
  it('GET /promotions/blocs', async () => {
    contrat('promotions_blocs', await request(app).get('/api/v1/promotions/blocs'), { cles: ['blocs'] });
  });
  it('GET /promotions/blocs/:id/produits', async () => {
    contrat('promotions_bloc_produits', await request(app).get(`/api/v1/promotions/blocs/${ID.bloc}/produits`), { cles: ['bloc', 'promotions'] });
  });
  it('GET /promotions/:section', async () => {
    contrat('promotions_section', await request(app).get('/api/v1/promotions/nos_promos_du_moment'), { cles: ['promotions'] });
  });

  // ── Compte ───────────────────────────────────────────────────
  it('GET /profile', async () => {
    const d = contrat('profile_get', await request(app).get('/api/v1/profile').set(auth()), { cles: ['user'] });
    expect(d.user).toMatchObject({ id: expect.any(String), email: expect.any(String), role: 'CLIENT' });
    expect(d.user).not.toHaveProperty('password');
  });
  it('PUT /profile { nom, prenom, telephone } (JSON)', async () => {
    const res = await request(app).put('/api/v1/profile').set(auth()).send({ nom: 'Sow', prenom: 'Fatou', telephone: '+221770000000' });
    contrat('profile_put', res, { cles: ['user'] });
  });
  it('PUT /profile/avatar (multipart, champ avatar)', async () => {
    const res = await request(app).put('/api/v1/profile/avatar').set(auth()).attach('avatar', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: 'a.jpg', contentType: 'image/jpeg' });
    contrat('profile_avatar', res, { cles: ['avatar'], champs: ['avatar'] });
  });
  it('GET /profile/adresses', async () => {
    const d = contrat('adresses_liste', await request(app).get('/api/v1/profile/adresses').set(auth()), { cles: ['adresses'] });
    expect(d.adresses[0]).toMatchObject({ id: expect.any(String), nomComplet: expect.any(String), telephone: expect.any(String), rue: expect.any(String), ville: expect.any(String), isDefault: expect.any(Boolean) });
  });
  it('POST /profile/adresses { nomComplet, telephone, rue, ville, region?, pays }', async () => {
    const res = await request(app).post('/api/v1/profile/adresses').set(auth()).send({ nomComplet: 'Fatou Sow', telephone: '+221771234567', rue: 'Sicap', ville: 'Dakar', pays: 'Sénégal' });
    contrat('adresse_creer', res, { status: 201, cles: ['adresse'] });
  });
  it('POST /suppression-compte { email, objet }', async () => {
    const res = await request(app).post('/api/v1/suppression-compte').send({ email: 'fatou@exemple.com', objet: 'Demande de suppression de mon compte depuis l’application mobile' });
    contrat('suppression_compte', res, { status: 201 });
  });

  // ── Commandes / paiement ─────────────────────────────────────
  it('POST /commandes { adresseId, methode, items[{produitId, quantite}] }', async () => {
    const res = await request(app).post('/api/v1/commandes').set(auth()).send({ adresseId: ID.adresse, methode: 'wave', items: [{ produitId: ID.produit, quantite: 2 }], note: 'Sonner deux fois', dateLivraisonSouhaitee: '2026-10-01' });
    const d = contrat('commande_creer', res, { status: 201, cles: ['commande'] });
    expect(d.commande).toMatchObject({ id: expect.any(String), reference: expect.any(String), statut: expect.any(String), montantTotal: expect.anything(), note: 'Sonner deux fois', dateLivraisonSouhaitee: '2026-10-01' });
  });
  it('GET /commandes?statut=', async () => {
    const d = contrat('commandes_liste', await request(app).get('/api/v1/commandes').set(auth()).query({ statut: 'en_attente' }), { cles: ['commandes', 'pagination'] });
    expect(d.commandes[0]).toMatchObject({ id: expect.any(String), reference: expect.any(String), items: expect.any(Array) });
  });
  it('GET /commandes/:id', async () => {
    const d = contrat('commande_detail', await request(app).get(`/api/v1/commandes/${ID.commande}`).set(auth()), { cles: ['commande'] });
    expect(d.commande.items[0]).toMatchObject({ produitId: expect.any(String), quantite: expect.any(Number), prixUnitaire: expect.anything(), sousTotal: expect.anything(), produit: expect.any(Object) });
  });
  it('PATCH /commandes/:id/annuler', async () => {
    contrat('commande_annuler', await request(app).patch(`/api/v1/commandes/${ID.commande}/annuler`).set(auth()), { cles: ['commande'] });
  });
  it('POST /commandes/:id/payer', async () => {
    const d = contrat('commande_payer', await request(app).post(`/api/v1/commandes/${ID.commande}/payer`).set(auth()), { cles: ['paiement'] });
    expect(d.paiement).toMatchObject({ id: expect.any(String), methode: expect.any(String), statut: expect.any(String), montant: expect.anything(), urlPaiement: expect.any(String), reference: expect.any(String) });
  });
  it('GET /commandes/:id/paiement', async () => {
    contrat('commande_paiement_statut', await request(app).get(`/api/v1/commandes/${ID.commande}/paiement`).set(auth()), { cles: ['paiement'] });
  });

  // ── Favoris ──────────────────────────────────────────────────
  it('GET /favoris', async () => {
    const d = contrat('favoris_liste', await request(app).get('/api/v1/favoris').set(auth()), { cles: ['boutiques'] });
    expect(Array.isArray(d.boutiques)).toBe(true);
  });
  it('POST /favoris { boutiqueId }', async () => {
    models.Favori.findOne.mockResolvedValueOnce(null);
    contrat('favori_ajouter', await request(app).post('/api/v1/favoris').set(auth()).send({ boutiqueId: ID.vendeur }), { status: 201 });
  });
  it('DELETE /favoris/:boutiqueId', async () => {
    contrat('favori_supprimer', await request(app).delete(`/api/v1/favoris/${ID.vendeur}`).set(auth()));
  });

  // ── Avis ─────────────────────────────────────────────────────
  it('GET /avis/produit/:produitId (public)', async () => {
    const d = contrat('avis_produit', await request(app).get(`/api/v1/avis/produit/${ID.produit}`), { cles: ['avis'] });
    expect(d.avis[0]).toMatchObject({ id: expect.any(String), note: expect.any(Number), produitId: expect.any(String), isApproved: expect.any(Boolean), user: { nom: expect.any(String), prenom: expect.any(String) } });
    expect(d.avis[0].user).not.toHaveProperty('email');
  });
  it('POST /avis { produitId, note, commentaire }', async () => {
    contrat('avis_creer', await request(app).post('/api/v1/avis').set(auth()).send({ produitId: ID.produit, note: 4, commentaire: 'Top' }), { status: 201, cles: ['avis'] });
  });
  it('GET /avis (mes avis)', async () => {
    const d = contrat('avis_mes', await request(app).get('/api/v1/avis').set(auth()), { cles: ['avis'] });
    expect(d.avis[0].produit).toMatchObject({ id: expect.any(String), nom: expect.any(String) });
  });
  it('PUT /avis/:id { note?, commentaire? }', async () => {
    contrat('avis_modifier', await request(app).put(`/api/v1/avis/${ID.avis}`).set(auth()).send({ note: 5 }), { cles: ['avis'] });
  });
  it('DELETE /avis/:id', async () => {
    contrat('avis_supprimer', await request(app).delete(`/api/v1/avis/${ID.avis}`).set(auth()));
  });
  it('GET /vendeur/avis', async () => {
    const d = contrat('vendeur_avis', await request(app).get('/api/v1/vendeur/avis').set(auth('VENDEUR')), { cles: ['avis'] });
    expect(d.avis[0]).toMatchObject({ user: expect.any(Object), produit: expect.any(Object) });
  });
  it('POST /vendeur/avis/:id/repondre { reponse }', async () => {
    const d = contrat('vendeur_avis_repondre', await request(app).post(`/api/v1/vendeur/avis/${ID.avis}/repondre`).set(auth('VENDEUR')).send({ reponse: 'Merci !' }), { cles: ['avis'] });
    expect(d.avis.reponseVendeur).toBe('Merci !');
  });

  // ── Messagerie ───────────────────────────────────────────────
  it('POST /messages { destinataireId, contenu }', async () => {
    const d = contrat('message_envoyer', await request(app).post('/api/v1/messages').set(auth()).send({ destinataireId: ID.vendeur, contenu: 'Bonjour' }), { status: 201, cles: ['message'] });
    expect(d.message).toMatchObject({ id: expect.any(String), contenu: expect.any(String) });
  });
  it('GET /messages/conversations', async () => {
    contrat('messages_conversations', await request(app).get('/api/v1/messages/conversations').set(auth()), { cles: ['conversations'] });
  });
  it('GET /messages/:userId', async () => {
    contrat('messages_historique', await request(app).get(`/api/v1/messages/${ID.vendeur}`).set(auth()), { cles: ['messages'] });
  });
  it('PUT /messages/:messageId/lire', async () => {
    contrat('message_lire', await request(app).put(`/api/v1/messages/${ID.message}/lire`).set(auth()));
  });
  it('GET /messages/non-lus', async () => {
    const d = contrat('messages_non_lus', await request(app).get('/api/v1/messages/non-lus').set(auth()), { cles: ['nombre'] });
    expect(typeof d.nombre).toBe('number');
  });

  // ── Notifications ────────────────────────────────────────────
  it('GET /notifications', async () => {
    const d = contrat('notifications_liste', await request(app).get('/api/v1/notifications').set(auth()), { cles: ['notifications', 'pagination'] });
    expect(d.notifications[0]).toMatchObject({ id: expect.any(String), titre: expect.any(String) });
  });
  it('GET /notifications/non-lues', async () => {
    const d = contrat('notifications_non_lues', await request(app).get('/api/v1/notifications/non-lues').set(auth()), { cles: ['total'] });
    expect(typeof d.total).toBe('number');
  });
  it('PATCH /notifications/toutes-lues', async () => {
    contrat('notifications_toutes_lues', await request(app).patch('/api/v1/notifications/toutes-lues').set(auth()), { cles: ['total'] });
  });
  it('PATCH /notifications/:id/lire', async () => {
    contrat('notification_lire', await request(app).patch(`/api/v1/notifications/${ID.notification}/lire`).set(auth()));
  });
  it('POST /device-token/register { token, plateforme }', async () => {
    contrat('device_token_register', await request(app).post('/api/v1/device-token/register').set(auth()).send({ token: 'fcm', plateforme: 'android' }));
  });
  it('POST /device-token/unregister { token }', async () => {
    contrat('device_token_unregister', await request(app).post('/api/v1/device-token/unregister').set(auth()).send({ token: 'fcm' }));
  });

  // ── Vendeur ──────────────────────────────────────────────────
  it('GET /vendeur/produits?statut=', async () => {
    const d = contrat('vendeur_produits', await request(app).get('/api/v1/vendeur/produits').set(auth('VENDEUR')).query({ statut: 'en_attente' }), { cles: ['produits', 'pagination'] });
    expect(d).not.toHaveProperty('success');
  });
  it('POST /vendeur/produits (multipart : nom, description, prix, stockAlloue, messageVendeur, images[])', async () => {
    const res = await request(app).post('/api/v1/vendeur/produits').set(auth('VENDEUR'))
      .field('nom', 'Huile').field('description', 'Bio').field('prix', '1500').field('stockAlloue', '20').field('messageVendeur', 'Merci')
      .attach('images', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: 'p.jpg', contentType: 'image/jpeg' });
    const d = contrat('vendeur_produit_creer', res, { status: 201, cles: ['produit'], champs: ['nom', 'description', 'prix', 'stockAlloue', 'messageVendeur', 'images'] });
    expect(d.produit.statutValidation).toBe('en_attente');
  });
  it('PUT /vendeur/produits/:id (multipart)', async () => {
    const res = await request(app).put(`/api/v1/vendeur/produits/${ID.produit}`).set(auth('VENDEUR')).field('nom', 'Huile bio');
    contrat('vendeur_produit_modifier', res, { cles: ['produit'], champs: ['nom', 'description', 'prix', 'stockAlloue', 'messageVendeur', 'images'] });
  });
  it('PATCH /vendeur/produits/:id/stock { stock?, stockAlloue? }', async () => {
    contrat('vendeur_produit_stock', await request(app).patch(`/api/v1/vendeur/produits/${ID.produit}/stock`).set(auth('VENDEUR')).send({ stockAlloue: 30 }), { cles: ['produit'] });
  });
  it('DELETE /vendeur/produits/:id', async () => {
    contrat('vendeur_produit_supprimer', await request(app).delete(`/api/v1/vendeur/produits/${ID.produit}`).set(auth('VENDEUR')));
  });
  it('GET /vendeur/produits/stats', async () => {
    contrat('vendeur_produits_stats', await request(app).get('/api/v1/vendeur/produits/stats').set(auth('VENDEUR')), { cles: ['stats'] });
  });
  it('GET /vendeur/commandes?statut=', async () => {
    const d = contrat('vendeur_commandes', await request(app).get('/api/v1/vendeur/commandes').set(auth('VENDEUR')).query({ statut: 'en_attente' }), { cles: ['commandes', 'pagination'] });
    expect(d).not.toHaveProperty('success');
  });
  it('GET /vendeur/commandes/ventes?jours=', async () => {
    contrat('vendeur_ventes', await request(app).get('/api/v1/vendeur/commandes/ventes').set(auth('VENDEUR')).query({ jours: 30 }), { cles: ['ventes'] });
  });
  it('GET /vendeur/commandes/:id', async () => {
    contrat('vendeur_commande_detail', await request(app).get(`/api/v1/vendeur/commandes/${ID.commande}`).set(auth('VENDEUR')), { cles: ['commande'] });
  });

  // ── Erreurs : même enveloppe, bon code HTTP ──────────────────
  it('validation Joi → 400 avec l’enveloppe', async () => {
    contrat('erreur_400_validation', await request(app).post('/api/v1/avis').set(auth()).send({ note: 9, commentaire: '', produitId: '' }), { status: 400, erreursChamps: true });
  });
  it('rôle insuffisant → 403 avec l’enveloppe', async () => {
    contrat('erreur_403', await request(app).get('/api/v1/vendeur/produits').set(auth('CLIENT')), { status: 403 });
  });
  it('route inconnue → 404 avec l’enveloppe', async () => {
    contrat('erreur_404', await request(app).get('/api/v1/inexistant'), { status: 404 });
  });
});
