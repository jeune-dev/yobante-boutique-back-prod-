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
} = require('./middlewares/rateLimit.middleware');
const correlationId = require('./middlewares/correlationId.middleware');
const auth = require('./middlewares/auth.middleware');
const adminMiddleware = require('./middlewares/admin.middleware');
const errorMiddleware = require('./middlewares/error.middleware');

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

// ✅ PERF: HTTP Caching middleware
app.use((req, res, next) => {
  if (req.method === 'GET') {
    // Données publiques (produits, catégories): cache 5 minutes
    if (
      req.path.includes('/produits') ||
      req.path.includes('/categories') ||
      req.path.includes('/rayons')
    ) {
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
    }
    // Données utilisateur: ne pas cacher
    else if (
      req.path.includes('/profile') ||
      req.path.includes('/panier') ||
      req.path.includes('/commandes')
    ) {
      res.setHeader('Cache-Control', 'private, no-cache');
    }
    // Admin: ne jamais cacher
    else if (req.path.includes('/admin')) {
      res.setHeader('Cache-Control', 'private, no-cache, no-store');
    }
    // Health check: cache court
    else if (req.path === '/health') {
      res.setHeader('Cache-Control', 'public, max-age=10');
    }
  } else {
    // Mutations: ne jamais cacher
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
app.use('/api/v1/admin', adminLimiter, auth, adminMiddleware, require('./routes/admin/index'));

// ── Routes vendeur (authentifiées + rate limiting) ────────────────────────
app.use('/api/v1/vendeur', authenticatedLimiter, auth, require('./routes/vendeur/index'));

// ── Routes client (publiques + certaines authentifiées) ───────────────────
app.use('/api/v1/produits', require('./routes/client/produit.route'));
app.use('/api/v1/categories', require('./routes/client/categorie.route'));
app.use('/api/v1/panier', authenticatedLimiter, auth, require('./routes/client/panier.route'));
app.use('/api/v1/commandes', authenticatedLimiter, auth, require('./routes/client/commande.route'));
app.use('/api/v1/paiements', authenticatedLimiter, auth, require('./routes/client/paiement.route'));
app.use(
  '/api/v1/notifications',
  authenticatedLimiter,
  auth,
  require('./routes/client/notification.route')
);
app.use(
  '/api/v1/device-token',
  authenticatedLimiter,
  auth,
  require('./routes/client/deviceToken.route')
);
app.use('/api/v1/avis', require('./routes/client/avis.route'));
app.use('/api/v1/profile', mutationLimiter, auth, require('./routes/client/profil.route'));
app.use('/api/v1/bannieres', require('./routes/client/banniere.route'));
app.use('/api/v1/promotions', require('./routes/client/promotion.route'));
app.use('/api/v1/frais-livraisons', require('./routes/client/frais-livraison.route'));
app.use('/api/v1/favoris', authenticatedLimiter, auth, require('./routes/client/favori.route'));
app.use('/api/v1/boutiques', require('./routes/client/boutique.route'));
app.use('/api/v1/rayons', require('./routes/client/rayon.route'));

// Évite la boucle /api/v1/v1/…
app.use('/api', (req, res, next) => {
  if (req.url === '/v1' || req.url.startsWith('/v1/')) return next();
  return res.redirect(301, `/api/v1${req.url}`);
});

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route introuvable', path: _req.path });
});

app.use(errorMiddleware);

module.exports = app;
