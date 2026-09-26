/**
 * TOUTES LES API — aucune ne doit répondre 5xx. BASE POSTGRESQL RÉELLE.
 *
 * Les routes ne sont pas déclarées à la main : elles sont découvertes sur
 * l'application Express (tests/helpers/listerRoutes.js). Une route ajoutée
 * demain est donc testée sans modifier ce fichier.
 *
 * Phases (dans cet ordre, sur les mêmes données) :
 *  1. GET avec les identifiants réels des données de test ;
 *  2. GET avec un identifiant invalide (« abc ») et un UUID inconnu ;
 *  3. mutations (POST/PUT/PATCH/DELETE) : UUID inconnu, corps vide ;
 *  4. scénarios métier avec des données VALIDES (écrans du dashboard) ;
 *  5. mutations sur les identifiants réels, corps vide ;
 *  6. suppressions réelles.
 * Un 4xx est une réponse normale (validation, droits, introuvable) ; un 5xx
 * est un défaut. Chaque phase liste tous les 5xx rencontrés, avec le message.
 *
 * Nécessite une base jetable (les tables sont vidées) :
 *   DB_IT=1 DB_HOST=localhost DB_PORT=55432 DB_USER=postgres DB_PASSWORD=
 *   DB_NAME=yobante_it npx jest tests/integration/api.toutes-routes.db
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

const actif = process.env.DB_IT === '1';
const decrire = actif ? describe : describe.skip;

// Quotas relevés : cette suite envoie plusieurs centaines de requêtes.
process.env.ADMIN_RATE_LIMIT_MAX = '100000';
process.env.AUTHENTICATED_RATE_LIMIT_MAX = '100000';
process.env.MUTATION_RATE_LIMIT_MAX = '100000';

// Services externes doublés par des fonctions simples (et non jest.fn :
// `resetMocks` de jest.config.js effacerait leurs valeurs de retour).
jest.mock('../../src/utils/mailer', () => {
  const ok = () => async () => null;
  return {
    sendMail: ok(), sendOtpEmail: ok(), sendWelcomeEmail: ok(), sendResetPasswordEmail: ok(),
    sendCommandeConfirmation: ok(), sendCommandeStatut: ok(), sendDemandeSuppressionCompteEmail: ok(),
  };
});
jest.mock('../../src/services/resend.service', () => ({ sendEmail: async () => ({ success: true }), FROM: 'test' }));
jest.mock('../../src/services/r2.service', () => ({
  uploadImage: async () => 'https://cdn.exemple/image.jpg', deleteImage: async () => null,
}));
jest.mock('../../src/services/upload.service', () => ({
  uploadImage: async () => 'https://cdn.exemple/image.jpg', deleteImage: async () => null,
}));
jest.mock('../../src/services/notification/push/index', () => ({ pousser: async () => null, estConfigure: () => false }));
jest.mock('../../src/services/paiement/index', () => ({
  resoudreFournisseur: () => ({
    nom: 'wave',
    initier: async () => ({ reference: 'TX-TEST-001', urlPaiement: 'https://pay.exemple/TX-TEST-001' }),
    verifier: async () => ({ statut: 'en_attente' }),
  }),
}));

jest.setTimeout(300000);

const UUID_INCONNU = '00000000-0000-4000-8000-00000000dead';

decrire('Toutes les API — PostgreSQL réel', () => {
  let app, m, cache, secret, routes;
  const d = {}; // données de test

  const jeton = (u) => jwt.sign({ id: u.id, role: u.role, isActive: true }, secret, { expiresIn: '1h' });
  const compteDe = (chemin) =>
    chemin.startsWith('/api/v1/admin') ? d.admin : chemin.startsWith('/api/v1/vendeur') ? d.vendeur : d.client;

  /** Identifiant réel à utiliser pour un paramètre de route. */
  function valeurParam(chemin, param) {
    const special = {
      produitId: d.produit.id, rayonId: d.rayon.id, section: 'nos_promos_du_moment',
      ville: 'Dakar', reference: 'TX-TEST-001', boutiqueId: d.profil.id,
      userId: d.vendeur.id, messageId: d.message.id,
    };
    if (param === 'slug') return chemin.includes('/categorie/') ? d.categorie.slug : d.produit.slug;
    if (special[param]) return special[param];
    const avant = chemin.slice('/api/v1/'.length, chemin.indexOf(`/:${param}`));
    const parSegment = [
      ['admin/users/admins', d.admin2], ['admin/users/clients', d.client], ['admin/users', d.client],
      ['admin/rayons/sous-rayons', d.sousRayon], ['rayons/sous-rayons', d.sousRayon],
      ['vendeur/abonnement/paiements', d.paiementAbonnement], ['promotions/blocs', d.bloc],
      ['profile/adresses', d.adresse], ['categories', d.categorie], ['produits', d.produit],
      ['commandes', d.commande], ['paiements', d.paiement], ['avis', d.avis], ['vendeurs', d.vendeur],
      ['bannieres', d.banniere], ['promotions', d.promotion], ['blocs-promo', d.bloc],
      ['frais-livraison', d.frais], ['rayons', d.rayon], ['signalements', d.signalement],
      ['notifications', d.notification], ['messages', d.message],
    ];
    const trouve = parSegment.find(([seg]) => avant.endsWith(seg));
    return trouve ? trouve[1].id : UUID_INCONNU;
  }

  const construire = (chemin, remplacer) => chemin.replace(/:([A-Za-z]+)/g, (_, p) => remplacer(p));

  async function appeler(methode, url, { corps = {}, compte } = {}) {
    cache.clear();
    const req = request(app)[methode](url).set('Authorization', `Bearer ${jeton(compte)}`);
    return methode === 'get' ? req.query({ page: 1, limit: 20 }) : req.send(corps);
  }

  /** Exécute une liste d'appels et renvoie les 5xx rencontrés. */
  async function balayer(appels) {
    const erreurs = [];
    for (const { methode, url, compte, corps } of appels) {
      const res = await appeler(methode, url, { compte, corps });
      if (res.status >= 500) erreurs.push(`${methode.toUpperCase()} ${url} → ${res.status} ${res.body?.message ?? ''}`);
    }
    return erreurs;
  }

  beforeAll(async () => {
    m = require('../../src/models');
    cache = require('../../src/config/cache');
    app = require('../../src/app');
    secret = require('../../src/config/security').jwtConfig.secret;
    routes = require('../helpers/listerRoutes').listerRoutes(app);

    // Schéma complet puis tables vidées : même point de départ à chaque exécution.
    await m.sequelize.sync();
    const tables = Object.values(m.sequelize.models).map((x) => `"${x.getTableName()}"`);
    await m.sequelize.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);

    const hash = await require('bcryptjs').hash('MotDePasse123!', 4);
    const U = (o) => m.User.create({ password: hash, isActive: true, isVerified: true, mustChangePassword: false, ...o });
    d.admin = await U({ nom: 'Admin', prenom: 'Principal', email: 'admin@yobante-test.sn', role: 'ADMIN' });
    d.admin2 = await U({ nom: 'Admin', prenom: 'Second', email: 'admin2@yobante-test.sn', role: 'ADMIN' });
    d.client = await U({ nom: 'Sow', prenom: 'Fatou', email: 'client@yobante-test.sn', role: 'CLIENT', telephone: '+221770000001' });
    d.vendeur = await U({ nom: 'Ndiaye', prenom: 'Awa', email: 'vendeur@yobante-test.sn', role: 'VENDEUR', telephone: '+221770000002' });
    d.profil = await m.ProfilVendeur.create({ userId: d.vendeur.id, nomBoutique: 'Boutique Awa', telephone: '+221770000002' });
    d.categorie = await m.Categorie.create({ nom: 'Épicerie', slug: 'epicerie' });
    d.rayon = await m.Rayon.create({ nom: 'Alimentation', slug: 'alimentation' });
    d.sousRayon = await m.SousRayon.create({ nom: 'Riz', slug: 'riz', rayonId: d.rayon.id });
    d.produit = await m.Produit.create({
      nom: 'Riz parfumé', slug: 'riz-parfume', prix: 5000, prixAchat: 3500, stock: 50, vendeurId: d.vendeur.id,
      categorieId: d.categorie.id, rayonId: d.rayon.id, sousRayonId: d.sousRayon.id, statutValidation: 'valide',
      images: ['https://cdn.exemple/riz.jpg'],
    });
    d.produitEnAttente = await m.Produit.create({
      nom: 'Huile', slug: 'huile', prix: 1500, stock: 5, vendeurId: d.vendeur.id, statutValidation: 'en_attente',
    });
    d.adresse = await m.Adresse.create({
      userId: d.client.id, nomComplet: 'Fatou Sow', telephone: '+221770000001', rue: 'Rue 10', ville: 'Dakar', pays: 'Sénégal', isDefault: true,
    });
    d.frais = await m.FraisLivraison.create({ ville: 'Dakar', pays: 'Sénégal', montant: 1000, isActive: true });
    d.commande = await m.Commande.create({
      reference: 'CMD-IT-0001', userId: d.client.id, adresseId: d.adresse.id, montantTotal: 11000, fraisLivraison: 1000,
    });
    await m.CommandeItem.create({ commandeId: d.commande.id, produitId: d.produit.id, quantite: 2, prixUnitaire: 5000, sousTotal: 10000 });
    d.paiement = await m.Paiement.create({ commandeId: d.commande.id, userId: d.client.id, montant: 11000, methode: 'wave', transactionId: 'TX-TEST-001' });
    d.avis = await m.Avis.create({ userId: d.client.id, produitId: d.produit.id, note: 4, commentaire: 'Très bon riz' });
    d.bloc = await m.BlocPromo.create({ section: 'nos_promos_du_moment', titre: 'Rentrée' });
    d.promotion = await m.Promotion.create({ produitId: d.produit.id, section: 'nos_promos_du_moment', prixPromo: 4500, blocPromoId: d.bloc.id });
    d.banniere = await m.Banniere.create({ image: 'https://cdn.exemple/banniere.jpg', titre: 'Promo' });
    d.signalement = await m.Signalement.create({ userId: d.client.id, type: 'produit', cibleId: d.produit.id, raison: 'Photo trompeuse' });
    d.notification = await m.Notification.create({ userId: d.client.id, titre: 'Bienvenue', message: 'Bonjour', type: 'systeme' }).catch(
      () => m.Notification.create({ userId: d.client.id, titre: 'Bienvenue', message: 'Bonjour', type: 'commande' })
    );
    d.message = await m.Message.create({ expediteurId: d.client.id, destinataireId: d.vendeur.id, contenu: 'Bonjour, dispo ?' });
    const debut = new Date();
    const fin = new Date(Date.now() + 30 * 864e5);
    d.abonnement = await m.Abonnement.create({ vendeurId: d.vendeur.id, montant: 5000, dateDebut: debut, dateFin: fin });
    d.paiementAbonnement = await m.PaiementAbonnement.create({ vendeurId: d.vendeur.id, montant: 5000, methode: 'wave' });
    await m.Favori.create({ userId: d.client.id, profilVendeurId: d.profil.id });
    await m.Panier.create({ userId: d.client.id, produitId: d.produit.id, quantite: 1 });
  });

  afterAll(async () => {
    if (m) await m.sequelize.close();
  });

  it('découvre toutes les routes (> 200)', () => {
    expect(routes.length).toBeGreaterThan(200);
  });

  it('1. GET, identifiants réels : aucun 5xx', async () => {
    const appels = routes
      .filter((r) => r.methode === 'get')
      .map((r) => ({ methode: 'get', url: construire(r.chemin, (p) => valeurParam(r.chemin, p)), compte: compteDe(r.chemin) }));
    expect(await balayer(appels)).toEqual([]);
  });

  it('2. GET, identifiant invalide ou inconnu : aucun 5xx', async () => {
    const appels = routes
      .filter((r) => r.methode === 'get' && r.chemin.includes('/:'))
      .flatMap((r) => ['abc', UUID_INCONNU].map((v) => ({ methode: 'get', url: construire(r.chemin, () => v), compte: compteDe(r.chemin) })));
    expect(await balayer(appels)).toEqual([]);
  });

  it('3. mutations, UUID inconnu et corps vide : aucun 5xx', async () => {
    const appels = routes
      .filter((r) => r.methode !== 'get')
      .map((r) => ({ methode: r.methode, url: construire(r.chemin, () => UUID_INCONNU), compte: compteDe(r.chemin), corps: {} }));
    expect(await balayer(appels)).toEqual([]);
  });

  describe('4. scénarios du dashboard avec des données valides', () => {
    const admin = (methode, url, corps) => appeler(methode, `/api/v1/admin${url}`, { compte: d.admin, corps });

    it('vendeurs : lister, consulter, modifier (payload exact du dashboard), bloquer, débloquer', async () => {
      expect((await admin('get', '/vendeurs')).status).toBe(200);
      expect((await admin('get', `/vendeurs/${d.vendeur.id}`)).status).toBe(200);
      const modif = await admin('put', `/vendeurs/${d.vendeur.id}`, {
        nom: 'Ndiaye', prenom: 'Awa Marie', email: 'vendeur@yobante-test.sn', nomBoutique: 'Boutique Awa & Fils',
        telephone: '+221 77 123 45 67', phoneCountryCode: 'SN', phoneNationalNumber: '771234567', adresseBoutique: 'Marché Sandaga',
      });
      expect([modif.status, modif.body.message]).toEqual([200, expect.any(String)]);
      const profil = await m.ProfilVendeur.findOne({ where: { userId: d.vendeur.id } });
      expect(profil.nomBoutique).toBe('Boutique Awa & Fils');
      expect((await m.User.findByPk(d.vendeur.id)).prenom).toBe('Awa Marie');
      expect((await admin('patch', `/vendeurs/${d.vendeur.id}/bloquer`)).status).toBe(200);
      expect((await admin('patch', `/vendeurs/${d.vendeur.id}/debloquer`)).status).toBe(200);
    });

    it('vendeurs : création', async () => {
      const res = await admin('post', '/vendeurs', {
        nom: 'Fall', prenom: 'Ibou', email: 'ibou@yobante-test.sn', nomBoutique: 'Chez Ibou', telephone: '+221771112233',
      });
      expect(res.status).toBe(201);
    });

    it('promotions : liste de la page d’accueil (limit=200), création, modification, activation, suppression', async () => {
      const liste = await request(app).get('/api/v1/admin/promotions?limit=200').set('Authorization', `Bearer ${jeton(d.admin)}`);
      expect(liste.status).toBe(200);
      expect(liste.body.data.promotions.length).toBeGreaterThan(0);
      expect((await admin('get', '/promotions/sections')).status).toBe(200);
      const cree = await admin('post', '/promotions', { produitId: d.produit.id, section: 'a_ne_pas_rater', prixPromo: 4000 });
      expect(cree.status).toBeLessThan(300);
      const id = cree.body.data.promotion.id;
      expect((await admin('put', `/promotions/${id}`, { prixPromo: 4200 })).status).toBe(200);
      expect((await admin('patch', `/promotions/${id}/toggle`)).status).toBe(200);
      expect((await admin('delete', `/promotions/${id}`)).status).toBe(200);
    });

    it('produits : liste des demandes (statutValidation=en_attente), recherche, validation en deux étapes, rejet', async () => {
      const res = await request(app).get('/api/v1/admin/produits?statutValidation=en_attente&search=&page=1&limit=20').set('Authorization', `Bearer ${jeton(d.admin)}`);
      expect(res.status).toBe(200);
      expect(res.body.data.produits.map((p) => p.id)).toEqual([d.produitEnAttente.id]);
      expect((await admin('get', '/produits?search=riz')).status).toBe(200);
      expect((await admin('patch', `/produits/${d.produitEnAttente.id}/valider-step1`)).status).toBe(200);
      expect((await admin('patch', `/produits/${d.produitEnAttente.id}/valider-step2`)).status).toBe(200);
      const autre = await m.Produit.create({ nom: 'Sucre', slug: 'sucre', prix: 800, statutValidation: 'en_attente', vendeurId: d.vendeur.id });
      expect((await admin('patch', `/produits/${autre.id}/rejeter`, { motif: 'Photo floue' })).status).toBe(200);
    });

    it('produits : création, modification, stock, mise en avant, visibilité', async () => {
      const cree = await request(app).post('/api/v1/admin/produits').set('Authorization', `Bearer ${jeton(d.admin)}`)
        .field('nom', 'Lait en poudre').field('prix', '2450').field('stock', '12').field('rayonId', d.rayon.id)
        .field('sousRayonId', d.sousRayon.id).field('description', 'Boîte 400 g');
      expect([cree.status, cree.body.message]).toEqual([201, expect.any(String)]);
      const id = cree.body.data.produit.id;
      const modif = await request(app).put(`/api/v1/admin/produits/${id}`).set('Authorization', `Bearer ${jeton(d.admin)}`)
        .field('nom', 'Lait en poudre 400 g').field('prix', '2500');
      expect(modif.status).toBe(200);
      expect((await admin('patch', `/produits/${id}/stock`, { quantite: 30 })).status).toBe(200);
      expect((await admin('patch', `/produits/${id}/featured`)).status).toBe(200);
      expect((await admin('patch', `/produits/${id}/visibilite`)).status).toBe(200);
      expect((await admin('get', `/produits/${id}`)).status).toBe(200);
    });

    it('commandes : cycle complet de statuts', async () => {
      const c = await m.Commande.create({ reference: 'CMD-IT-0002', userId: d.client.id, adresseId: d.adresse.id, montantTotal: 5000 });
      for (const etape of ['valider', 'preparation', 'expedier', 'livrer']) {
        const res = await admin('patch', `/commandes/${c.id}/${etape}`, {});
        expect([etape, res.status]).toEqual([etape, 200]);
      }
      expect((await admin('get', '/commandes/kpi')).status).toBe(200);
      expect((await admin('get', '/commandes/export')).status).toBe(200);
    });

    it('rayons et sous-rayons : création, modification, archivage', async () => {
      const r = await admin('post', '/rayons', { nom: 'Hygiène' });
      expect(r.status).toBeLessThan(300);
      const rayonId = r.body.data.rayon.id;
      expect((await admin('put', `/rayons/${rayonId}`, { nom: 'Hygiène & beauté' })).status).toBe(200);
      const sr = await admin('post', `/rayons/${rayonId}/sous-rayons`, { nom: 'Savons' });
      expect(sr.status).toBeLessThan(300);
      expect((await admin('patch', `/rayons/${rayonId}/archiver`)).status).toBe(200);
    });

    it('catégories, frais de livraison, blocs promo, bannières : création et modification', async () => {
      const cat = await admin('post', '/categories', { nom: 'Boissons' });
      expect(cat.status).toBeLessThan(300);
      const f = await admin('post', '/frais-livraison', { ville: 'Thiès', pays: 'Sénégal', montant: 2000 });
      expect(f.status).toBeLessThan(300);
      expect((await admin('put', `/frais-livraison/${f.body.data.frais?.id ?? f.body.data.fraisLivraison?.id ?? d.frais.id}`, { montant: 2500 })).status).toBe(200);
      const b = await admin('post', '/blocs-promo', { section: 'a_ne_pas_rater', titre: 'Fin de mois' });
      expect(b.status).toBeLessThan(300);
      expect((await admin('get', '/blocs-promo')).status).toBe(200);
      expect((await admin('patch', `/bannieres/${d.banniere.id}/toggle`)).status).toBe(200);
    });

    it('utilisateurs : administrateurs, clients, dashboard, avis, paiements, signalements', async () => {
      const a = await admin('post', '/users/admins', { nom: 'Diallo', prenom: 'Mamadou', email: 'mamadou@yobante-test.sn', telephone: '+221771234500' });
      expect(a.status).toBeLessThan(300);
      expect((await admin('put', `/users/admins/${d.admin2.id}`, { prenom: 'Deuxième' })).status).toBe(200);
      expect((await admin('patch', `/users/clients/${d.client.id}/desactiver`)).status).toBe(200);
      expect((await admin('patch', `/users/clients/${d.client.id}/activer`)).status).toBe(200);
      const fiche = await admin('get', `/users/${d.client.id}`);
      expect([fiche.status, fiche.body.data?.user?.email]).toEqual([200, d.client.email]);
      for (const url of ['/dashboard/kpi-complet', '/users/clients', '/users/admins', '/avis', '/paiements', '/signalements', '/me']) {
        const res = await admin('get', url);
        expect([url, res.status]).toEqual([url, 200]);
      }
      expect((await admin('patch', `/avis/${d.avis.id}/approuver`)).status).toBeLessThan(500);
      expect((await admin('patch', `/signalements/${d.signalement.id}`, { statut: 'traite', reponseAdmin: 'Vérifié' })).status).toBeLessThan(500);
    });
  });

  it('5. mutations, identifiants réels et corps vide : aucun 5xx', async () => {
    const appels = routes
      .filter((r) => !['get', 'delete'].includes(r.methode))
      .map((r) => ({ methode: r.methode, url: construire(r.chemin, (p) => valeurParam(r.chemin, p)), compte: compteDe(r.chemin), corps: {} }));
    expect(await balayer(appels)).toEqual([]);
  });

  it('6. suppressions réelles : aucun 5xx', async () => {
    const appels = routes
      .filter((r) => r.methode === 'delete')
      .map((r) => ({ methode: 'delete', url: construire(r.chemin, (p) => valeurParam(r.chemin, p)), compte: compteDe(r.chemin) }));
    expect(await balayer(appels)).toEqual([]);
  });

  it('cache HTTP : jamais pour une réponse liée à un compte, 5 min pour le catalogue public anonyme', async () => {
    const entete = async (url, compte) => {
      const req = request(app).get(url);
      if (compte) req.set('Authorization', `Bearer ${jeton(compte)}`);
      return (await req).headers['cache-control'];
    };
    // Une liste admin mise en cache restait affichée jusqu'à 5 min après une création.
    for (const url of ['/api/v1/admin/produits', '/api/v1/admin/rayons', '/api/v1/admin/categories']) {
      expect([url, await entete(url, d.admin)]).toEqual([url, 'private, no-cache, no-store']);
    }
    expect(await entete('/api/v1/vendeur/produits', d.vendeur)).toBe('private, no-cache, no-store');
    expect(await entete('/api/v1/produits', d.client)).toBe('private, no-cache, no-store');
    expect(await entete('/api/v1/produits')).toBe('public, max-age=300');
    expect(await entete('/api/v1/rayons')).toBe('public, max-age=300');
  });

  it('aucune réponse ne divulgue le prix d’achat hors administration', async () => {
    for (const url of ['/api/v1/produits', `/api/v1/produits/${d.produit.id}`, '/api/v1/commandes']) {
      const res = await appeler('get', url, { compte: d.client });
      expect([url, JSON.stringify(res.body).includes('prixAchat')]).toEqual([url, false]);
    }
  });
});
