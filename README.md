# 🛍️ Yobante Boutique Backend

Backend API pour la plateforme e-commerce **Yobante Boutique** — vente de produits avec gestion de commandes, panier, profil utilisateur, et dashboard admin.

**Status**: ✅ Production-ready (refactorisation architecture complète)

---

## 📋 Architecture

```
src/
├── index.js              # Point d'entrée
├── app.js                # Configuration Express (middlewares, routes)
├── server.js             # Démarrage serveur (DB, logging)
├── config/               # Configuration centralisée
│   ├── db.js            # PostgreSQL + Sequelize
│   ├── logger.js        # Winston logging
│   ├── security.js      # JWT, CORS, rate-limit, validation
│   └── cloudinary.js    # CDN images
├── models/              # Sequelize models (12 modèles)
│   ├── User.model.js
│   ├── Produit.model.js
│   ├── Categorie.model.js
│   ├── Commande.model.js
│   ├── Panier.model.js
│   ├── Paiement.model.js
│   ├── Avis.model.js
│   └── ...
├── routes/              # Express routes (protégées & publiques)
│   ├── auth.routes.js
│   ├── admin/
│   └── client/
├── controllers/         # Request handlers avec ApiResponse
├── services/           # Business logic (isolated from controllers)
├── middlewares/        # Auth, validation, error handling
│   ├── auth.middleware.js
│   ├── error.middleware.js
│   ├── validate.middleware.js
│   └── ...
├── utils/              # Utilitaires réutilisables
│   ├── ApiResponse.js  # Réponses API uniformes ✨
│   ├── AppError.js     # Classe d'erreur personnalisée ✨
│   ├── asyncHandler.js # Wrapper pour erreurs async ✨
│   ├── logger.js
│   ├── mailer.js
│   ├── slugify.js
│   ├── formatUser.js
│   └── ...
├── validations/       # Joi schemas
├── templates/         # Email templates
├── seeders/           # Data initialization
└── docs/              # OpenAPI/Swagger spec
```

---

## 🚀 Quick Start

### 1️⃣ Installation

```bash
# Cloner le projet
git clone <repo>
cd yobante-boutique-back

# Installer les dépendances
npm install

# Copier .env.example → .env et configurer
cp .env.example .env
```

### 2️⃣ Configuration .env

```env
# Database
DB_HOST=localhost
DB_NAME=yobante_boutique
DB_USER=postgres
DB_PASSWORD=postgres

# JWT (générer avec: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=your_secure_secret
JWT_REFRESH_SECRET=your_different_secret
JWT_RESET_SECRET=another_different_secret

# CORS
CORS_ORIGIN=http://localhost:3000

# Cloudinary & Email
CLOUDINARY_CLOUD_NAME=...
RESEND_API_KEY=...
```

### 3️⃣ Démarrer

```bash
# Développement (avec nodemon)
npm run dev

# Production
npm start

# Créer un admin (seeder)
npm run seed:admin
```

### 4️⃣ Avec Docker (recommandé)

```bash
# Démarrer tout (PostgreSQL + Backend)
make dev       # ou : docker compose up --build -d

make logs      # Voir les logs backend
make db        # Shell PostgreSQL
make stop      # Arrêter
make backup    # Sauvegarder la DB
```

### 5️⃣ Tester l'API

```bash
# Health check
curl http://localhost:5000/health

# Docs Swagger
http://localhost:5000/api-docs
```

---

## 📚 Endpoints — Base URL : `/api/v1`

> Les routes `/api/*` redirigent automatiquement vers `/api/v1/*` (301).

### 🔐 Auth
- `POST /api/v1/auth/register` — Créer un compte (5/h par IP)
- `POST /api/v1/auth/login` — Se connecter (10/15min par IP)
- `POST /api/v1/auth/refresh` — Renouveler token
- `POST /api/v1/auth/logout` — Se déconnecter
- `POST /api/v1/auth/forgot-password` — Réinitialisation (3/h par IP)
- `POST /api/v1/auth/change-password` (protégé) — Changer mot de passe

### 🛒 Shop (Client)
- `GET /api/v1/produits` — Tous les produits (filtres, pagination, max 100/page)
- `GET /api/v1/panier` — Voir panier (protégé)
- `POST /api/v1/commandes` — Passer commande (protégé)
- `GET /api/v1/avis` — Avis produit
- `PATCH /api/v1/profile` — Mettre à jour profil (protégé)
- `GET /api/v1/bannieres` — Bannières actives
- `GET /api/v1/promotions` — Promotions par section
- `GET /api/v1/frais-livraisons` — Tarifs livraison

### 👨‍💼 Admin (JWT ADMIN requis)
- `GET /api/v1/admin/dashboard/stats` — KPI globaux
- `GET /api/v1/admin/dashboard/kpi-stocks` — Stock en rupture
- `GET /api/v1/admin/produits` — Gestion produits
- `GET /api/v1/admin/vendeurs` — Gestion vendeurs (double validation)
- `GET /api/v1/admin/commandes` — Toutes les commandes
- `GET /api/v1/admin/utilisateurs` — Gestion utilisateurs

### 🏪 Vendeur (JWT VENDEUR requis)
- `GET /api/v1/vendeur/produits` — Mes produits
- `POST /api/v1/vendeur/produits` — Soumettre un produit
- `GET /api/v1/vendeur/profil` — Mon profil boutique

**[Voir la collection Postman complète →](./Yobante-API.postman_collection.json)**

---

## 🔒 Sécurité

### ✅ Implémenté
- **JWT** — 3 secrets différents (access/refresh/reset) + `isActive` dans payload (zéro DB call par requête)
- **Refresh token rotation** — ancien token révoqué à chaque refresh (replay detection)
- **Bcrypt** — 12 rounds salt
- **Helmet** — HTTP headers sécurisés
- **CORS** — origines explicites (jamais `*` en prod)
- **Rate limiting** — 100/15min global · 10/15min login · 5/h register · 3/h forgot-password · 20/10min upload
- **Anti user-enumeration** — messages génériques sur register et forgot-password
- **Validation Joi** — tous les inputs validés avant traitement
- **SQL Injection** — Sequelize ORM paramétré
- **X-Request-ID** — correlation header sur toutes les réponses
- **Body limit** — 2mb max (anti-DoS)
- **RBAC** — 3 rôles (ADMIN/CLIENT/VENDEUR) avec middlewares dédiés
- **Double validation vendeur** — step1 + step2 admin avant activation

### 🔜 À ajouter (next sprint)
- Redis pour cache + blacklist JWT révoqués
- 2FA TOTP optionnel
- Audit trail (historique actions utilisateur)
- CSRF tokens (si rendu SSR)

---

## 📦 Réponses API Uniformes

Toutes les réponses suivent ce pattern:

```javascript
// Succès
{
  "success": true,
  "message": "Utilisateur créé avec succès",
  "data": { /* ... */ }
}

// Erreur
{
  "success": false,
  "message": "Email déjà utilisé",
  "errors": [/* optionnel */]
}
```

**Codes HTTP**:
- `200` — OK (GET, PUT)
- `201` — Created (POST créant une ressource)
- `400` — Bad Request (validation)
- `401` — Unauthorized (token invalide)
- `403` — Forbidden (insufficient permissions)
- `404` — Not Found
- `409` — Conflict (unique constraint)
- `429` — Too Many Requests
- `500` — Server Error

---

## 🧪 Tests

Utiliser **Postman** pour tester l'API:

```bash
# Import la collection
Postman → Import → Yobante-API.postman_collection.json

# Configurer les variables
- base_url = http://localhost:5000
- access_token = (généré après login)
- refresh_token = (généré après login)
```

**[Guide complet →](./POSTMAN_GUIDE.md)**

---

## 🗄️ Base de Données

### Models (12)
- **User** — Authentification & profil
- **Produit** — Catalogue
- **Categorie** — Classification
- **Panier** — Shopping cart
- **Commande** — Orders
- **CommandeItem** — Order items
- **Paiement** — Transactions
- **Avis** — Product reviews
- **Adresse** — Delivery addresses
- **RefreshToken** — Token management
- **UserOtp** — 2FA codes

### Migrations

```bash
# Dev: synchronize automatiquement (alter:true)
npm run dev

# Prod: manual migrations (force:false, ne jamais alter)
# Database doit être créée manuellement en prod
```

---

## 📊 Environment Variables

| Variable | Exemple | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environnement (dev/prod) |
| `PORT` | `5000` | Port d'écoute |
| `DB_HOST` | `localhost` | Serveur PostgreSQL |
| `JWT_SECRET` | `abc123...` | Secret JWT (CHANGER en prod!) |
| `CORS_ORIGIN` | `http://localhost:3000` | Origins autorisées |
| `CLOUDINARY_*` | `...` | CDN images |
| `RESEND_API_KEY` | `re_...` | Service email |

[Voir .env.example →](./.env.example)

---

## 🔧 Scripts

```bash
npm run dev              # Développement (nodemon)
npm start                # Production
npm run seed:admin       # Créer compte admin
npm run lint             # ESLint
npm run lint:fix         # ESLint auto-fix
npm run format           # Prettier
npm run format:check     # Vérifier formatage (CI)
npm test                 # Jest
npm run test:coverage    # Coverage

# Avec Makefile (Docker)
make dev        # docker compose up --build
make stop       # docker compose down
make logs       # Logs backend
make backup     # Backup PostgreSQL
make test       # npm test
```

---

## 📝 Logging

Winston logger avec:
- **Console output** (développement colorisé)
- **File output** (logs/ en production)
- **Niveaux**: debug, info, warn, error

```javascript
// Utilisation
const logger = require('./config/logger');
logger.info('Message info');
logger.error('Erreur', { context: '...' });
```

---

## 🚢 Déploiement

### Render

```bash
# Build command
npm install

# Start command
npm start

# Environment variables
NODE_ENV=production
JWT_SECRET=your_prod_secret
DB_HOST=your_db_host
... (voir .env.example)
```

### Vérifications avant prod

- [ ] NODE_ENV=production
- [ ] JWT_SECRET, JWT_REFRESH_SECRET, JWT_RESET_SECRET changés
- [ ] ADMIN_EMAIL et ADMIN_PASSWORD changés
- [ ] DB_SSL=true
- [ ] CORS_ORIGIN = domaines réels
- [ ] Cloudinary & Resend configurés
- [ ] .gitignore inclut .env

---

## 🐛 Troubleshooting

| Erreur | Solution |
|--------|----------|
| `Database connection refused` | Vérifier DB_HOST, DB_PORT, credentials |
| `JWT secrets must be different` | Générer 3 secrets différents |
| `CORS_ORIGIN=* interdit en production` | Définir domaines explicites |
| `Cloudinary upload fails` | Vérifier API KEY et CLOUD NAME |
| `Email not sent` | Vérifier RESEND_API_KEY |

---

## 📚 Documentation

- [API Endpoints](./POSTMAN_GUIDE.md) — Guide complet Postman
- [Swagger/OpenAPI](http://localhost:5000/api-docs) — Docs interactives
- [Architecture Decision Records](./docs/) — ADRs

---

## 🤝 Contributing

1. Clone et create branch: `git checkout -b feature/my-feature`
2. Commit: `git commit -am 'Add feature'`
3. Push: `git push origin feature/my-feature`
4. Open PR

---

## 📄 License

MIT — Yobante Boutique 2025

---

## 👥 Support

- **Issues**: [GitHub Issues](https://github.com/yobante/boutique-back/issues)
- **Email**: support@yobante.com
- **Docs**: [Wiki](https://github.com/yobante/boutique-back/wiki)
"# Test deployment" 
