/**
 * Parcours de l'application mobile — EFFETS RÉELS EN BASE (PostgreSQL).
 *
 * Le contrat (tests/contract) vérifie la FORME des échanges avec des modèles
 * doublés. Ici, les mêmes appels que le mobile traversent l'API jusqu'à une
 * vraie base, et l'on vérifie ce qui a réellement été écrit, refusé ou
 * masqué : stock, lignes de commande, visibilité du catalogue, isolement
 * entre comptes, droits par rôle, données réservées.
 *
 *   DB_IT=1 DB_HOST=localhost DB_PORT=55432 DB_USER=postgres DB_PASSWORD=
 *   DB_NAME=yobante_it npx jest tests/integration/mobile.flux.db
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

const actif = process.env.DB_IT === '1';
const decrire = actif ? describe : describe.skip;

process.env.AUTHENTICATED_RATE_LIMIT_MAX = '100000';
process.env.MUTATION_RATE_LIMIT_MAX = '100000';

// Services externes doublés par des fonctions simples (`resetMocks` de
// jest.config.js effacerait les valeurs de retour de jest.fn).
jest.mock('../../src/utils/mailer', () => {
  const ok = () => async () => null;
  return {
    sendMail: ok(), sendOtpEmail: ok(), sendWelcomeEmail: ok(), sendResetPasswordEmail: ok(),
    sendCommandeConfirmation: ok(), sendCommandeStatut: ok(), sendDemandeSuppressionCompteEmail: ok(),
  };
});
jest.mock('../../src/services/resend.service', () => ({ sendEmail: async () => ({ success: true }), FROM: 'test' }));
jest.mock('../../src/services/r2.service', () => ({ uploadImage: async () => 'https://cdn.exemple/i.jpg', deleteImage: async () => null }));
jest.mock('../../src/services/upload.service', () => ({ uploadImage: async () => 'https://cdn.exemple/i.jpg', deleteImage: async () => null }));
jest.mock('../../src/services/notification/push/index', () => ({ pousser: async () => null, estConfigure: () => false }));

jest.setTimeout(120000);

decrire('Parcours mobile — PostgreSQL réel', () => {
  let app, m, cache, secret;
  const d = {};

  const jeton = (u) => jwt.sign({ id: u.id, role: u.role, isActive: true }, secret, { expiresIn: '1h' });
  const en = (u) => ({ Authorization: `Bearer ${jeton(u)}` });
  const api = (methode, url, compte, corps) => {
    cache.clear();
    const req = request(app)[methode](`/api/v1${url}`);
    if (compte) req.set(en(compte));
    return corps ? req.send(corps) : req;
  };
  const stock = async (p) => (await m.Produit.findByPk(p.id)).stock;

  beforeAll(async () => {
    m = require('../../src/models');
    cache = require('../../src/config/cache');
    app = require('../../src/app');
    secret = require('../../src/config/security').jwtConfig.secret;
    await m.sequelize.sync();
    const tables = Object.values(m.sequelize.models).map((x) => `"${x.getTableName()}"`);
    await m.sequelize.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);

    const U = (o) => m.User.create({ password: 'x'.repeat(60), isActive: true, isVerified: true, mustChangePassword: false, ...o });
    d.fatou = await U({ nom: 'Sow', prenom: 'Fatou', email: 'fatou@yobante-test.sn', role: 'CLIENT' });
    d.moussa = await U({ nom: 'Diop', prenom: 'Moussa', email: 'moussa@yobante-test.sn', role: 'CLIENT' });
    d.awa = await U({ nom: 'Ndiaye', prenom: 'Awa', email: 'awa@yobante-test.sn', role: 'VENDEUR' });
    d.ibou = await U({ nom: 'Sarr', prenom: 'Ibou', email: 'ibou@yobante-test.sn', role: 'VENDEUR' });
    // Actifs, comme les crée l'administration (le modèle vaut `false` par défaut).
    d.boutiqueAwa = await m.ProfilVendeur.create({ userId: d.awa.id, nomBoutique: 'Boutique Awa', isActive: true });
    await m.ProfilVendeur.create({ userId: d.ibou.id, nomBoutique: 'Chez Ibou', isActive: true });
    d.adresseFatou = await m.Adresse.create({ userId: d.fatou.id, nomComplet: 'Fatou Sow', telephone: '770000001', rue: 'Rue 10', ville: 'Dakar', pays: 'Sénégal', isDefault: true });
    d.adresseMoussa = await m.Adresse.create({ userId: d.moussa.id, nomComplet: 'Moussa Diop', telephone: '770000002', rue: 'Rue 5', ville: 'Thiès', pays: 'Sénégal', isDefault: true });
    await m.FraisLivraison.create({ ville: 'Dakar', pays: 'Sénégal', montant: 1000, isActive: true });

    const P = (o) => m.Produit.create({ isActive: true, statutValidation: 'valide', vendeurId: d.awa.id, prixAchat: 999, ...o });
    d.riz = await P({ nom: 'Riz parfumé', slug: 'riz-parfume', prix: 5000, stock: 10, isFeatured: true });
    d.huile = await P({ nom: 'Huile végétale', slug: 'huile-vegetale', prix: 1750, stock: 3, vendeurId: d.ibou.id });
    // Étape 1 de validation : actif, mais PAS encore publié.
    d.enCours = await P({ nom: 'Riz brisé en validation', slug: 'riz-brise', prix: 3000, stock: 10, statutValidation: 'valide_step1', isFeatured: true });
    d.enAttente = await P({ nom: 'Riz rouge en attente', slug: 'riz-rouge', prix: 3000, stock: 10, statutValidation: 'en_attente', isActive: false });
  });

  afterAll(async () => {
    if (m) await m.sequelize.close();
  });

  describe('catalogue public : seuls les produits publiés', () => {
    it('liste, recherche, mise en avant, fiche : un produit non validé n’apparaît nulle part', async () => {
      const ids = async (url) => {
        const res = await api('get', url);
        expect([url, res.status]).toEqual([url, 200]);
        return (res.body.data.produits || []).map((p) => p.id);
      };
      for (const url of ['/produits', '/produits?search=riz', '/produits/recherche?q=riz', '/produits/featured']) {
        const liste = await ids(url);
        expect([url, liste.includes(d.enCours.id), liste.includes(d.enAttente.id)]).toEqual([url, false, false]);
      }
      expect((await ids('/produits')).sort()).toEqual([d.riz.id, d.huile.id].sort());
      expect((await api('get', '/produits/riz-brise')).status).toBe(404);
      expect((await api('get', '/produits/riz-parfume')).status).toBe(200);
    });

    it('le prix d’achat ne sort jamais, même authentifié (client ou vendeur propriétaire)', async () => {
      for (const [url, compte] of [
        ['/produits', null], ['/produits/riz-parfume', d.fatou], ['/produits/featured', null],
        ['/produits/recherche?q=riz', null], ['/vendeur/produits', d.awa],
      ]) {
        const res = await api('get', url, compte);
        expect([url, res.status, JSON.stringify(res.body).includes('prixAchat')]).toEqual([url, 200, false]);
      }
      // …et il est bien conservé en base.
      expect((await m.Produit.scope('administration').findByPk(d.riz.id)).prixAchat).toBe('999.00');
    });
  });

  describe('commande client', () => {
    it('commande d’un produit non publié refusée, stock intact, rien d’écrit', async () => {
      const avant = await m.Commande.count();
      const res = await api('post', '/commandes', d.fatou, {
        adresseId: d.adresseFatou.id, methode: 'cash_livraison', items: [{ produitId: d.enCours.id, quantite: 1 }],
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/n'est plus disponible/);
      expect(await m.Commande.count()).toBe(avant);
      expect(await stock(d.enCours)).toBe(10);
    });

    it('création : prix relus en base, stock décrémenté, paiement en attente', async () => {
      const res = await api('post', '/commandes', d.fatou, {
        adresseId: d.adresseFatou.id, methode: 'wave', note: 'Sonner deux fois', dateLivraisonSouhaitee: '2026-12-01',
        items: [{ produitId: d.riz.id, quantite: 2 }, { produitId: d.huile.id, quantite: 1 }],
      });
      expect(res.status).toBe(201);
      d.commandeFatou = res.body.data.commande;
      const c = await m.Commande.findByPk(d.commandeFatou.id, { include: ['items', 'paiement'] });
      expect(c.statut).toBe('en_attente');
      expect(Number(c.montantTotal)).toBe(2 * 5000 + 1750 + 1000);
      expect(c.items).toHaveLength(2);
      expect(c.paiement).toMatchObject({ methode: 'wave', statut: 'en_attente' });
      expect(await stock(d.riz)).toBe(8);
      expect(await stock(d.huile)).toBe(2);
    });

    it('adresse d’un autre client : refus, aucune commande', async () => {
      const avant = await m.Commande.count();
      const res = await api('post', '/commandes', d.fatou, {
        adresseId: d.adresseMoussa.id, methode: 'wave', items: [{ produitId: d.riz.id, quantite: 1 }],
      });
      expect(res.status).toBe(400);
      expect(await m.Commande.count()).toBe(avant);
    });

    it('isolement : un client ne lit ni n’annule la commande d’un autre', async () => {
      expect((await api('get', `/commandes/${d.commandeFatou.id}`, d.moussa)).status).toBe(403);
      expect((await api('patch', `/commandes/${d.commandeFatou.id}/annuler`, d.moussa)).status).toBe(403);
      const listeMoussa = await api('get', '/commandes', d.moussa);
      expect(listeMoussa.body.data.commandes).toEqual([]);
      expect((await m.Commande.findByPk(d.commandeFatou.id)).statut).toBe('en_attente');
    });

    it('un client ne peut ni valider ni rejeter une commande (réservé à l’administration)', async () => {
      for (const action of ['valider', 'rejeter']) {
        const res = await api('patch', `/commandes/${d.commandeFatou.id}/${action}`, d.fatou, { motif: 'x' });
        // Routes retirées du périmètre client (404) ou refusées (403) : jamais exécutées.
        expect([action, [403, 404].includes(res.status)]).toEqual([action, true]);
      }
      expect((await m.Commande.findByPk(d.commandeFatou.id)).statut).toBe('en_attente');
    });

    it('filtre de statut et liste complète (limit=100) comme le demande le mobile', async () => {
      const toutes = await api('get', '/commandes?limit=100', d.fatou);
      expect(toutes.body.data.commandes).toHaveLength(1);
      expect(toutes.body.data.pagination.limit).toBe(100);
      expect((await api('get', '/commandes?statut=livree', d.fatou)).body.data.commandes).toEqual([]);
      expect((await api('get', '/commandes?statut=en_attente', d.fatou)).body.data.commandes).toHaveLength(1);
    });

    it('annulation par le client : statut annulée, stock restitué', async () => {
      const res = await api('patch', `/commandes/${d.commandeFatou.id}/annuler`, d.fatou);
      expect(res.status).toBe(200);
      expect((await m.Commande.findByPk(d.commandeFatou.id)).statut).toBe('annulee');
      expect(await stock(d.riz)).toBe(10);
      expect(await stock(d.huile)).toBe(3);
      // Une seconde annulation est refusée : le stock n'est pas restitué deux fois.
      expect((await api('patch', `/commandes/${d.commandeFatou.id}/annuler`, d.fatou)).status).toBe(400);
      expect(await stock(d.riz)).toBe(10);
    });
  });

  describe('vendeur', () => {
    it('produit soumis : en attente, inactif, invisible des acheteurs', async () => {
      const res = await request(app).post('/api/v1/vendeur/produits').set(en(d.awa))
        .field('nom', 'Mil local').field('description', 'Sac de 5 kg').field('prix', '2500').field('stockAlloue', '20');
      expect(res.status).toBe(201);
      const cree = await m.Produit.findByPk(res.body.data.produit.id);
      expect(cree).toMatchObject({ statutValidation: 'en_attente', isActive: false, vendeurId: d.awa.id });
      const catalogue = await api('get', '/produits');
      expect(catalogue.body.data.produits.map((p) => p.id)).not.toContain(cree.id);
    });

    it('un vendeur ne modifie ni ne supprime le produit d’un autre vendeur', async () => {
      const modif = await request(app).put(`/api/v1/vendeur/produits/${d.huile.id}`).set(en(d.awa)).field('nom', 'Piratage');
      expect(modif.status).toBeGreaterThanOrEqual(400);
      expect(modif.status).toBeLessThan(500);
      expect((await api('delete', `/vendeur/produits/${d.huile.id}`, d.awa)).status).toBeGreaterThanOrEqual(400);
      const huile = await m.Produit.findByPk(d.huile.id);
      expect(huile).toMatchObject({ nom: 'Huile végétale', isActive: true });
    });

    it('un client n’accède à aucune route vendeur', async () => {
      for (const url of ['/vendeur/produits', '/vendeur/commandes', '/vendeur/abonnement']) {
        expect([url, (await api('get', url, d.fatou)).status]).toEqual([url, 403]);
      }
    });
  });

  describe('données personnelles', () => {
    it('favoris : ajout idempotent, retrait effectif', async () => {
      expect((await api('post', '/favoris', d.fatou, { boutiqueId: d.boutiqueAwa.id })).status).toBeLessThan(300);
      expect((await api('post', '/favoris', d.fatou, { boutiqueId: d.boutiqueAwa.id })).status).toBeLessThan(300);
      expect(await m.Favori.count({ where: { userId: d.fatou.id } })).toBe(1);
      expect((await api('delete', `/favoris/${d.boutiqueAwa.id}`, d.fatou)).status).toBe(200);
      expect(await m.Favori.count({ where: { userId: d.fatou.id } })).toBe(0);
    });

    it('avis : un seul par produit et par client, non modifiable par un autre client', async () => {
      const cree = await api('post', '/avis', d.fatou, { produitId: d.riz.id, note: 5, commentaire: 'Excellent' });
      expect(cree.status).toBe(201);
      const doublon = await api('post', '/avis', d.fatou, { produitId: d.riz.id, note: 1, commentaire: 'Bis' });
      expect(doublon.status).toBe(400);
      expect(await m.Avis.count({ where: { userId: d.fatou.id, produitId: d.riz.id } })).toBe(1);
      const avisId = cree.body.data.avis.id;
      expect((await api('put', `/avis/${avisId}`, d.moussa, { note: 1 })).status).toBeGreaterThanOrEqual(400);
      expect((await api('delete', `/avis/${avisId}`, d.moussa)).status).toBeGreaterThanOrEqual(400);
      expect((await m.Avis.findByPk(avisId)).note).toBe(5);
    });

    it('adresses : chaque client ne voit que les siennes', async () => {
      const res = await api('get', '/profile/adresses', d.fatou);
      expect(res.body.data.adresses.map((a) => a.id)).toEqual([d.adresseFatou.id]);
    });

    it('messages : envoyés, relus par le destinataire seulement', async () => {
      const envoi = await api('post', '/messages', d.fatou, { destinataireId: d.awa.id, contenu: 'Le riz est dispo ?' });
      expect(envoi.status).toBe(201);
      const msg = await m.Message.findByPk(envoi.body.data.message.id);
      expect(msg).toMatchObject({ expediteurId: d.fatou.id, destinataireId: d.awa.id, contenu: 'Le riz est dispo ?' });
      const nonLus = await api('get', '/messages/non-lus', d.awa);
      expect(Object.values(nonLus.body.data).some((v) => v === 1)).toBe(true);
      // Un tiers ne peut pas marquer lu un message qui ne lui est pas destiné.
      await api('put', `/messages/${msg.id}/lire`, d.moussa);
      expect((await m.Message.findByPk(msg.id)).lu).toBeFalsy();
      await api('put', `/messages/${msg.id}/lire`, d.awa);
      expect((await m.Message.findByPk(msg.id)).lu).toBe(true);
    });
  });

  describe('authentification', () => {
    it('sans jeton, aucune route personnelle n’est accessible', async () => {
      for (const url of ['/commandes', '/profile', '/favoris', '/notifications', '/messages/conversations']) {
        expect([url, (await api('get', url)).status]).toEqual([url, 401]);
      }
    });

    it('compte désactivé : refusé même avec un jeton encore valide', async () => {
      await d.moussa.update({ isActive: false });
      cache.clear();
      expect((await api('get', '/commandes', d.moussa)).status).toBe(403);
      await d.moussa.update({ isActive: true });
    });
  });
});
