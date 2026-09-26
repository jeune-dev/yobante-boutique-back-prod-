const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const openapiSpec = require('./docs/openapi');
const logger = require('./config/logger');
const { corsConfig } = require('./config/security');
const {
  globalLimiter,
  authenticatedLimiter,
  adminLimiter,
  mutationLimiter,
  suppressionCompteLimiter,
} = require('./middlewares/rateLimit.middleware');
const correlationId = require('./middlewares/correlationId.middleware');
const auth = require('./middlewares/auth.middleware');
const adminMiddleware = require('./middlewares/admin.middleware');
const errorMiddleware = require('./middlewares/error.middleware');
const motDePasseChange = require('./middlewares/motDePasseChange.middleware');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

// ── HTTP Request Logging (Morgan) ───────────────────────────────────────────
// ✅ PERF: Sampling en production (5% des logs) pour réduire I/O
const skipLogging = isProd
  ? (req) => {
      // Production: Skip 95% des logs (log 5% = ~50 req/sec à 1000 RPS)
      return Math.random() > 0.05;
    }
  : () => false; // Dev: log tous

app.use(
  morgan(isProd ? 'tiny' : 'dev', {
    stream: { write: (msg) => logger.info(msg.trim()) },
    skip: skipLogging,
  })
);

// ✅ PERF: Compression optimisée (gzip par défaut, Brotli optionnel)
// Pour Brotli: npm install iltorb
const compressionOptions = {
  level: isProd ? 6 : 1, // Production: compression level 6 (bon équilibre)
  threshold: isProd ? 1024 : 0, // Compresser les réponses > 1KB
  filter: (req, res) => {
    // Ne pas compresser les streams ou fichiers binaires
    const contentType = res.getHeader('content-type');
    if (!contentType) return true;
    if (contentType.includes('application/octet-stream')) return false;
    if (contentType.includes('image/')) return false;
    return true;
  },
};

app.use(compression(compressionOptions));
app.use(correlationId);
app.use(helmet());
app.use(cors(corsConfig));
app.use(globalLimiter);

// ✅ PERF: Request timeouts (éviter les hangs indéfinis)
app.use((req, res, next) => {
  let timeout = 30000; // 30 secondes par défaut

  // Augmenter le timeout pour certaines routes
  if (req.path.includes('/export')) {
    timeout = 300000; // 5 minutes pour exports volumineux
  } else if (req.path.includes('/upload')) {
    timeout = 60000; // 1 minute pour uploads
  } else if (req.path.includes('/admin')) {
    timeout = 45000; // 45 secondes pour opérations admin
  } else if (req.path.includes('/import')) {
    timeout = 120000; // 2 minutes pour imports
  }

  res.setTimeout(timeout, () => {
    res.status(408).json({
      success: false,
      message: 'La requête a dépassé le délai imparti. Veuillez réessayer.',
    });
  });

  next();
});

// ✅ PERF: Body size limits (1MB global, higher for specific routes)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Routes with higher limits (if needed)
app.use('/api/v1/upload', express.json({ limit: '50mb' }));
app.use('/api/v1/import', express.json({ limit: '10mb' }));

// ── Cache HTTP ────────────────────────────────────────────────────────────
// Seul le catalogue PUBLIC consulté sans jeton peut être mis en cache
// (5 min). Une réponse liée à un compte — admin, vendeur, ou toute requête
// portant un jeton — ne l'est jamais : auparavant `/admin/produits`,
// `/admin/rayons`… passaient par la règle « catalogue » (le test portait sur
// `includes('/produits')`) et revenaient avec `public, max-age=300` : le
// dashboard affichait des listes périmées jusqu'à 5 minutes après une
// création ou une validation, et un proxy pouvait les servir à un tiers.
const CATALOGUE_PUBLIC = /^\/api\/v1\/(produits|categories|rayons)(\/|$)/;
app.use((req, res, next) => {
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (req.path === '/health') {
    res.setHeader('Cache-Control', 'public, max-age=10');
  } else if (!req.headers.authorization && CATALOGUE_PUBLIC.test(req.path)) {
    res.setHeader('Cache-Control', 'public, max-age=300');
  } else {
    res.setHeader('Cache-Control', 'private, no-cache, no-store');
  }
  next();
});

app.get('/', (_req, res) => {
  res
    .status(200)
    .json({ name: 'Yobante Boutique API', status: 'ok', docs: '/api-docs', api: '/api/v1' });
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

// ── Routes d'authentification (strict rate limiting) ──────────────────────
app.use('/api/v1/auth', require('./routes/auth.routes'));

// ── Routes admin (protégées + rate limiting) ──────────────────────────────
// `motDePasseChange` suit `auth` partout : un compte encore sur son mot de
// passe temporaire est refuse cote serveur, quelle que soit l'interface.
app.use(
  '/api/v1/admin',
  adminLimiter,
  auth,
  motDePasseChange,
  adminMiddleware,
  require('./routes/admin/index')
);

// ── Routes vendeur (authentifiées + rate limiting) ────────────────────────
app.use(
  '/api/v1/vendeur',
  authenticatedLimiter,
  auth,
  motDePasseChange,
  require('./routes/vendeur/index')
);

// ── Routes client (publiques + certaines authentifiées) ───────────────────
app.use('/api/v1/produits', require('./routes/client/produit.route'));
app.use('/api/v1/categories', require('./routes/client/categorie.route'));
app.use(
  '/api/v1/panier',
  authenticatedLimiter,
  auth,
  motDePasseChange,
  require('./routes/client/panier.route')
);
app.use(
  '/api/v1/commandes',
  authenticatedLimiter,
  auth,
  motDePasseChange,
  require('./routes/client/commande.route')
);
// Callback et URL de retour des fournisseurs de paiement : appelés par le
// fournisseur (pas par l'application), donc sans JWT — la confiance repose
// sur la signature vérifiée dans le service. Un JWT exigé ici bloquait la
// confirmation de tous les paiements en ligne.
app.use('/api/v1/paiements', authenticatedLimiter, require('./routes/client/paiement.route'));
app.use(
  '/api/v1/notifications',
  authenticatedLimiter,
  auth,
  motDePasseChange,
  require('./routes/client/notification.route')
);
app.use(
  '/api/v1/device-token',
  authenticatedLimiter,
  auth,
  motDePasseChange,
  require('./routes/client/deviceToken.route')
);
app.use('/api/v1/avis', require('./routes/client/avis.route'));
app.use(
  '/api/v1/signalements',
  mutationLimiter,
  auth,
  motDePasseChange,
  require('./routes/client/signalement.route')
);
app.use(
  '/api/v1/profile',
  mutationLimiter,
  auth,
  motDePasseChange,
  require('./routes/client/profil.route')
);
app.use('/api/v1/bannieres', require('./routes/client/banniere.route'));
app.use('/api/v1/promotions', require('./routes/client/promotion.route'));
app.use('/api/v1/frais-livraisons', require('./routes/client/frais-livraison.route'));
app.use(
  '/api/v1/favoris',
  authenticatedLimiter,
  auth,
  motDePasseChange,
  require('./routes/client/favori.route')
);
app.use('/api/v1/boutiques', require('./routes/client/boutique.route'));
app.use('/api/v1/rayons', require('./routes/client/rayon.route'));
app.use('/api/v1/acheteurs', require('./routes/client/acheteur.route'));
app.use(
  '/api/v1/messages',
  authenticatedLimiter,
  auth,
  motDePasseChange,
  require('./routes/client/message.route')
);
app.use(
  '/api/v1/suppression-compte',
  suppressionCompteLimiter,
  require('./routes/client/suppressionCompte.route')
);

// Évite la boucle /api/v1/v1/…
app.use('/api', (req, res, next) => {
  if (req.url === '/v1' || req.url.startsWith('/v1/')) return next();
  return res.redirect(301, `/api/v1${req.url}`);
});

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route introuvable', data: null });
});

app.use(errorMiddleware);

module.exports = app;
