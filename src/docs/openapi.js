// ─────────────────────────────────────────────────────────────
// docs/openapi.js — Spécification OpenAPI 3.0 de l'API Yobante Boutique
// ─────────────────────────────────────────────────────────────

const ErrorResponse = {
  type: 'object',
  properties: { message: { type: 'string' } },
};

const Pagination = {
  type: 'object',
  properties: {
    total: { type: 'integer' },
    totalPages: { type: 'integer' },
    page: { type: 'integer' },
    limit: { type: 'integer' },
  },
};

const User = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    nom: { type: 'string' },
    prenom: { type: 'string' },
    email: { type: 'string', format: 'email' },
    telephone: { type: 'string', nullable: true },
    role: { type: 'string', enum: ['CLIENT', 'ADMIN'] },
    isActive: { type: 'boolean' },
    isVerified: { type: 'boolean' },
    avatar: { type: 'string', nullable: true },
  },
};

const Categorie = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    nom: { type: 'string' },
    slug: { type: 'string' },
    description: { type: 'string', nullable: true },
    image: { type: 'string', nullable: true },
    isActive: { type: 'boolean' },
    parentId: { type: 'string', format: 'uuid', nullable: true },
  },
};

const Produit = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    nom: { type: 'string' },
    slug: { type: 'string' },
    description: { type: 'string', nullable: true },
    prix: { type: 'number' },
    prixPromo: { type: 'number', nullable: true },
    stock: { type: 'integer' },
    images: { type: 'array', items: { type: 'string' }, nullable: true },
    isActive: { type: 'boolean' },
    isFeatured: { type: 'boolean' },
    poids: { type: 'number', nullable: true },
    reference: { type: 'string', nullable: true },
    rayonId: { type: 'string', format: 'uuid', nullable: true },
    sousRayonId: { type: 'string', format: 'uuid', nullable: true },
    // Conservée pour l'historique : la catégorie n'est plus renseignée à la
    // création, le classement se fait par rayon / sous-rayon.
    categorieId: { type: 'string', format: 'uuid', nullable: true },
  },
};

const Boutique = {
  type: 'object',
  nullable: true,
  properties: {
    id: { type: 'string', format: 'uuid' },
    nom: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    adresse: { type: 'string', nullable: true },
    telephone: { type: 'string', nullable: true },
    infoLegale: { type: 'string', nullable: true },
    logo: { type: 'string', nullable: true },
    latitude: { type: 'number', nullable: true },
    longitude: { type: 'number', nullable: true },
  },
};

// Vue « vendeur » renvoyée à l'admin : le compte, plus les informations de la
// boutique à la fois regroupées (`boutique`) et à plat, telles que les
// tableaux de l'interface les consomment.
const Vendeur = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    nom: { type: 'string' },
    prenom: { type: 'string' },
    email: { type: 'string', format: 'email' },
    telephone: { type: 'string', nullable: true },
    role: { type: 'string', enum: ['VENDEUR'] },
    isActive: { type: 'boolean' },
    isBlocked: { type: 'boolean' },
    statut: { type: 'string', enum: ['actif', 'bloque'] },
    mustChangePassword: { type: 'boolean' },
    boutique: Boutique,
    nomBoutique: { type: 'string', nullable: true },
    adresseBoutique: { type: 'string', nullable: true },
    descriptionBoutique: { type: 'string', nullable: true },
    telephoneBoutique: { type: 'string', nullable: true },
    logoBoutique: { type: 'string', nullable: true },
  },
};

const Adresse = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    nomComplet: { type: 'string' },
    telephone: { type: 'string' },
    rue: { type: 'string' },
    ville: { type: 'string' },
    region: { type: 'string', nullable: true },
    pays: { type: 'string' },
    codePostal: { type: 'string', nullable: true },
    isDefault: { type: 'boolean' },
  },
};

const CommandeItem = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    produitId: { type: 'string', format: 'uuid' },
    quantite: { type: 'integer' },
    prixUnitaire: { type: 'number' },
    sousTotal: { type: 'number' },
    produit: Produit,
  },
};

const Commande = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    reference: { type: 'string' },
    userId: { type: 'string', format: 'uuid' },
    adresseId: { type: 'string', format: 'uuid' },
    statut: {
      type: 'string',
      enum: ['en_attente', 'validee', 'en_preparation', 'expediee', 'livree', 'annulee'],
    },
    montantTotal: { type: 'number' },
    fraisLivraison: { type: 'number' },
    note: { type: 'string', nullable: true },
    noteAdmin: { type: 'string', nullable: true },
    items: { type: 'array', items: CommandeItem },
  },
};

const Paiement = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    commandeId: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid' },
    montant: { type: 'number' },
    methode: { type: 'string', enum: ['wave', 'orange_money', 'carte', 'cash_livraison'] },
    statut: { type: 'string', enum: ['en_attente', 'succes', 'echoue', 'rembourse'] },
    transactionId: { type: 'string', nullable: true },
    payeAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

const Avis = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid' },
    produitId: { type: 'string', format: 'uuid' },
    note: { type: 'integer', minimum: 1, maximum: 5 },
    commentaire: { type: 'string', nullable: true },
    isApproved: { type: 'boolean' },
  },
};

const bearerAuth = [{ bearerAuth: [] }];
const errorResponses = {
  400: {
    description: 'Requête invalide',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
  },
  401: {
    description: 'Non authentifié',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
  },
  403: {
    description: 'Accès refusé',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
  },
  404: {
    description: 'Ressource introuvable',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
  },
  500: {
    description: 'Erreur serveur',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
  },
};

function jsonBody(schema) {
  return { content: { 'application/json': { schema } } };
}

function okJson(description, schema) {
  return { description, content: { 'application/json': { schema } } };
}

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Yobante Boutique API',
    version: '1.0.0',
    description:
      'API du backend e-commerce Yobante Boutique (auth, catalogue, panier, commandes, paiements, avis, administration).',
  },
  servers: [{ url: '/api', description: 'Serveur courant' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      ErrorResponse,
      Pagination,
      User,
      Categorie,
      Boutique,
      Vendeur,
      Produit,
      Adresse,
      Commande,
      CommandeItem,
      Paiement,
      Avis,
    },
  },
  tags: [
    { name: 'Auth', description: 'Inscription, connexion, gestion du mot de passe' },
    { name: 'Client - Produits', description: 'Catalogue public' },
    { name: 'Client - Panier', description: "Panier de l'utilisateur connecté" },
    { name: 'Client - Commandes', description: "Commandes de l'utilisateur connecté" },
    { name: 'Client - Avis', description: "Avis de l'utilisateur connecté" },
    { name: 'Client - Profil', description: 'Profil et adresses' },
    { name: 'Admin - Utilisateurs', description: 'Gestion des admins et des clients' },
    { name: 'Admin - Catégories', description: 'Gestion des catégories' },
    { name: 'Admin - Produits', description: 'Gestion des produits' },
    { name: 'Admin - Commandes', description: 'Gestion du cycle de vie des commandes' },
    { name: 'Admin - Paiements', description: 'Gestion des paiements' },
    { name: 'Admin - Avis', description: 'Modération des avis' },
    { name: 'Admin - Dashboard', description: 'Statistiques' },
  ],
  paths: {
    // ── AUTH ──────────────────────────────────────────────────────────────
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Créer un compte client',
        requestBody: jsonBody({
          type: 'object',
          required: ['nom', 'prenom', 'email', 'password'],
          properties: {
            nom: { type: 'string' },
            prenom: { type: 'string' },
            email: { type: 'string' },
            password: { type: 'string' },
            telephone: { type: 'string' },
          },
        }),
        responses: {
          201: okJson('Compte créé', {
            type: 'object',
            properties: { message: { type: 'string' }, user: User },
          }),
          ...errorResponses,
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Connexion (email ou téléphone)',
        requestBody: jsonBody({
          type: 'object',
          required: ['identifiant', 'password'],
          properties: { identifiant: { type: 'string' }, password: { type: 'string' } },
        }),
        responses: {
          200: okJson('Connecté', {
            type: 'object',
            properties: { token: { type: 'string' }, refreshToken: { type: 'string' }, user: User },
          }),
          ...errorResponses,
        },
      },
    },
    '/auth/admin/login': {
      post: {
        tags: ['Auth'],
        summary: 'Connexion au dashboard admin (rôle ADMIN uniquement, 403 sinon)',
        requestBody: jsonBody({
          type: 'object',
          required: ['identifiant', 'password'],
          properties: { identifiant: { type: 'string' }, password: { type: 'string' } },
        }),
        responses: {
          200: okJson('Connecté', {
            type: 'object',
            properties: { token: { type: 'string' }, refreshToken: { type: 'string' }, user: User },
          }),
          ...errorResponses,
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: "Rafraîchir l'access token",
        requestBody: jsonBody({
          type: 'object',
          required: ['refreshToken'],
          properties: { refreshToken: { type: 'string' } },
        }),
        responses: {
          200: okJson('Nouveau couple de tokens', {
            type: 'object',
            properties: { token: { type: 'string' }, refreshToken: { type: 'string' } },
          }),
          ...errorResponses,
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Déconnexion (révoque le refresh token)',
        requestBody: jsonBody({ type: 'object', properties: { refreshToken: { type: 'string' } } }),
        responses: {
          200: okJson('Déconnecté', {
            type: 'object',
            properties: { message: { type: 'string' } },
          }),
          ...errorResponses,
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Demander un code de réinitialisation par email',
        requestBody: jsonBody({
          type: 'object',
          required: ['email'],
          properties: { email: { type: 'string' } },
        }),
        responses: {
          200: okJson('Message générique', {
            type: 'object',
            properties: { message: { type: 'string' } },
          }),
          ...errorResponses,
        },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Réinitialiser le mot de passe avec le code OTP',
        requestBody: jsonBody({
          type: 'object',
          required: ['email', 'otp', 'newPassword'],
          properties: {
            email: { type: 'string' },
            otp: { type: 'string' },
            newPassword: { type: 'string' },
          },
        }),
        responses: {
          200: okJson('Mot de passe réinitialisé', {
            type: 'object',
            properties: { message: { type: 'string' } },
          }),
          ...errorResponses,
        },
      },
    },
    '/auth/change-password': {
      put: {
        tags: ['Auth'],
        summary: 'Changer le mot de passe (connecté)',
        security: bearerAuth,
        requestBody: jsonBody({
          type: 'object',
          required: ['oldPassword', 'newPassword'],
          properties: { oldPassword: { type: 'string' }, newPassword: { type: 'string' } },
        }),
        responses: {
          200: okJson('Mot de passe modifié', {
            type: 'object',
            properties: { message: { type: 'string' } },
          }),
          ...errorResponses,
        },
      },
    },

    // ── CLIENT - PRODUITS ────────────────────────────────────────────────
    '/produits': {
      get: {
        tags: ['Client - Produits'],
        summary: 'Catalogue produits (filtres, pagination)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'categorieId', in: 'query', schema: { type: 'string' } },
          { name: 'prixMin', in: 'query', schema: { type: 'number' } },
          { name: 'prixMax', in: 'query', schema: { type: 'number' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          {
            name: 'tri',
            in: 'query',
            schema: { type: 'string', enum: ['prix_asc', 'prix_desc', 'recent'] },
          },
        ],
        responses: {
          200: okJson('Liste des produits', {
            type: 'object',
            properties: { produits: { type: 'array', items: Produit }, pagination: Pagination },
          }),
          ...errorResponses,
        },
      },
    },
    '/produits/featured': {
      get: {
        tags: ['Client - Produits'],
        summary: 'Produits mis en avant',
        responses: {
          200: okJson('Liste', {
            type: 'object',
            properties: { produits: { type: 'array', items: Produit } },
          }),
          ...errorResponses,
        },
      },
    },
    '/produits/recherche': {
      get: {
        tags: ['Client - Produits'],
        summary: 'Recherche de produits',
        parameters: [{ name: 'q', in: 'query', schema: { type: 'string' }, required: true }],
        responses: {
          200: okJson('Résultats', {
            type: 'object',
            properties: { produits: { type: 'array', items: Produit }, pagination: Pagination },
          }),
          ...errorResponses,
        },
      },
    },
    '/produits/{id}/recommandes': {
      get: {
        tags: ['Client - Produits'],
        summary: 'Produits recommandés (même catégorie)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Liste', {
            type: 'object',
            properties: { produits: { type: 'array', items: Produit } },
          }),
          ...errorResponses,
        },
      },
    },
    '/produits/categorie/{slug}': {
      get: {
        tags: ['Client - Produits'],
        summary: "Produits d'une catégorie",
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Liste', {
            type: 'object',
            properties: {
              categorie: Categorie,
              produits: { type: 'array', items: Produit },
              pagination: Pagination,
            },
          }),
          ...errorResponses,
        },
      },
    },
    '/produits/{slug}': {
      get: {
        tags: ['Client - Produits'],
        summary: 'Détail produit + avis approuvés',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Produit', {
            type: 'object',
            properties: { produit: Produit, noteMoyenne: { type: 'number' } },
          }),
          ...errorResponses,
        },
      },
    },

    // ── CLIENT - PANIER ──────────────────────────────────────────────────
    '/panier': {
      get: {
        tags: ['Client - Panier'],
        summary: 'Voir mon panier',
        security: bearerAuth,
        responses: {
          200: okJson('Panier', {
            type: 'object',
            properties: {
              items: { type: 'array' },
              sousTotal: { type: 'number' },
              fraisLivraison: { type: 'number' },
              total: { type: 'number' },
            },
          }),
          ...errorResponses,
        },
      },
      post: {
        tags: ['Client - Panier'],
        summary: 'Ajouter un produit au panier',
        security: bearerAuth,
        requestBody: jsonBody({
          type: 'object',
          required: ['produitId'],
          properties: { produitId: { type: 'string' }, quantite: { type: 'integer' } },
        }),
        responses: { 200: okJson('Panier mis à jour', { type: 'object' }), ...errorResponses },
      },
      delete: {
        tags: ['Client - Panier'],
        summary: 'Vider le panier',
        security: bearerAuth,
        responses: {
          200: okJson('Panier vidé', {
            type: 'object',
            properties: { message: { type: 'string' } },
          }),
          ...errorResponses,
        },
      },
    },
    '/panier/{produitId}': {
      put: {
        tags: ['Client - Panier'],
        summary: 'Modifier la quantité (0 = retirer)',
        security: bearerAuth,
        parameters: [{ name: 'produitId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: jsonBody({
          type: 'object',
          required: ['quantite'],
          properties: { quantite: { type: 'integer' } },
        }),
        responses: { 200: okJson('Panier mis à jour', { type: 'object' }), ...errorResponses },
      },
      delete: {
        tags: ['Client - Panier'],
        summary: 'Retirer un produit du panier',
        security: bearerAuth,
        parameters: [{ name: 'produitId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Retiré', { type: 'object', properties: { message: { type: 'string' } } }),
          ...errorResponses,
        },
      },
    },

    // ── CLIENT - COMMANDES ───────────────────────────────────────────────
    '/commandes': {
      get: {
        tags: ['Client - Commandes'],
        summary: 'Mes commandes',
        security: bearerAuth,
        responses: {
          200: okJson('Liste', {
            type: 'object',
            properties: { commandes: { type: 'array', items: Commande }, pagination: Pagination },
          }),
          ...errorResponses,
        },
      },
      post: {
        tags: ['Client - Commandes'],
        summary: 'Passer commande depuis le panier',
        security: bearerAuth,
        requestBody: jsonBody({
          type: 'object',
          required: ['adresseId', 'methode'],
          properties: {
            adresseId: { type: 'string' },
            methode: { type: 'string', enum: ['wave', 'orange_money', 'carte', 'cash_livraison'] },
            note: { type: 'string' },
          },
        }),
        responses: {
          201: okJson('Commande créée', {
            type: 'object',
            properties: { message: { type: 'string' }, commande: Commande },
          }),
          ...errorResponses,
        },
      },
    },
    '/commandes/{id}': {
      get: {
        tags: ['Client - Commandes'],
        summary: 'Détail de ma commande',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Commande', { type: 'object', properties: { commande: Commande } }),
          ...errorResponses,
        },
      },
    },
    '/commandes/{id}/annuler': {
      patch: {
        tags: ['Client - Commandes'],
        summary: 'Annuler ma commande (si en_attente)',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Commande annulée', {
            type: 'object',
            properties: { message: { type: 'string' }, commande: Commande },
          }),
          ...errorResponses,
        },
      },
    },

    // ── CLIENT - AVIS ────────────────────────────────────────────────────
    '/avis': {
      get: {
        tags: ['Client - Avis'],
        summary: 'Mes avis',
        security: bearerAuth,
        responses: {
          200: okJson('Liste', {
            type: 'object',
            properties: { avis: { type: 'array', items: Avis } },
          }),
          ...errorResponses,
        },
      },
      post: {
        tags: ['Client - Avis'],
        summary: 'Laisser un avis sur un produit',
        security: bearerAuth,
        requestBody: jsonBody({
          type: 'object',
          required: ['produitId', 'note'],
          properties: {
            produitId: { type: 'string' },
            note: { type: 'integer' },
            commentaire: { type: 'string' },
          },
        }),
        responses: {
          201: okJson('Avis créé (en attente de modération)', {
            type: 'object',
            properties: { message: { type: 'string' }, avis: Avis },
          }),
          ...errorResponses,
        },
      },
    },
    '/avis/{id}': {
      put: {
        tags: ['Client - Avis'],
        summary: 'Modifier mon avis',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: jsonBody({
          type: 'object',
          properties: { note: { type: 'integer' }, commentaire: { type: 'string' } },
        }),
        responses: {
          200: okJson('Avis modifié', {
            type: 'object',
            properties: { message: { type: 'string' }, avis: Avis },
          }),
          ...errorResponses,
        },
      },
      delete: {
        tags: ['Client - Avis'],
        summary: 'Supprimer mon avis',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Supprimé', { type: 'object', properties: { message: { type: 'string' } } }),
          ...errorResponses,
        },
      },
    },

    // ── CLIENT - PROFIL ──────────────────────────────────────────────────
    '/profile': {
      get: {
        tags: ['Client - Profil'],
        summary: 'Mon profil',
        security: bearerAuth,
        responses: {
          200: okJson('Profil', { type: 'object', properties: { user: User } }),
          ...errorResponses,
        },
      },
      put: {
        tags: ['Client - Profil'],
        summary: 'Modifier mon profil',
        security: bearerAuth,
        requestBody: jsonBody({
          type: 'object',
          properties: {
            nom: { type: 'string' },
            prenom: { type: 'string' },
            telephone: { type: 'string' },
          },
        }),
        responses: {
          200: okJson('Profil modifié', {
            type: 'object',
            properties: { message: { type: 'string' }, user: User },
          }),
          ...errorResponses,
        },
      },
    },
    '/profile/avatar': {
      put: {
        tags: ['Client - Profil'],
        summary: 'Changer mon avatar',
        security: bearerAuth,
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { avatar: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: {
          200: okJson('Avatar modifié', {
            type: 'object',
            properties: { message: { type: 'string' }, avatar: { type: 'string' } },
          }),
          ...errorResponses,
        },
      },
    },
    '/profile/adresses': {
      get: {
        tags: ['Client - Profil'],
        summary: 'Mes adresses',
        security: bearerAuth,
        responses: {
          200: okJson('Liste', {
            type: 'object',
            properties: { adresses: { type: 'array', items: Adresse } },
          }),
          ...errorResponses,
        },
      },
      post: {
        tags: ['Client - Profil'],
        summary: 'Ajouter une adresse',
        security: bearerAuth,
        requestBody: jsonBody(Adresse),
        responses: {
          201: okJson('Adresse créée', {
            type: 'object',
            properties: { message: { type: 'string' }, adresse: Adresse },
          }),
          ...errorResponses,
        },
      },
    },
    '/profile/adresses/{id}': {
      put: {
        tags: ['Client - Profil'],
        summary: 'Modifier une adresse',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: jsonBody(Adresse),
        responses: {
          200: okJson('Adresse modifiée', {
            type: 'object',
            properties: { message: { type: 'string' }, adresse: Adresse },
          }),
          ...errorResponses,
        },
      },
      delete: {
        tags: ['Client - Profil'],
        summary: 'Supprimer une adresse',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Supprimée', { type: 'object', properties: { message: { type: 'string' } } }),
          ...errorResponses,
        },
      },
    },
    '/profile/adresses/{id}/default': {
      patch: {
        tags: ['Client - Profil'],
        summary: 'Définir comme adresse par défaut',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Adresse par défaut', {
            type: 'object',
            properties: { message: { type: 'string' }, adresse: Adresse },
          }),
          ...errorResponses,
        },
      },
    },

    // ── ADMIN - UTILISATEURS ─────────────────────────────────────────────
    '/admin/users/admins': {
      get: {
        tags: ['Admin - Utilisateurs'],
        summary: 'Liste des admins',
        security: bearerAuth,
        responses: {
          200: okJson('Liste', {
            type: 'object',
            properties: { admins: { type: 'array', items: User }, pagination: Pagination },
          }),
          ...errorResponses,
        },
      },
      post: {
        tags: ['Admin - Utilisateurs'],
        summary: 'Créer un admin',
        security: bearerAuth,
        requestBody: jsonBody({
          type: 'object',
          required: ['nom', 'prenom', 'email', 'password'],
          properties: {
            nom: { type: 'string' },
            prenom: { type: 'string' },
            email: { type: 'string' },
            password: { type: 'string' },
            telephone: { type: 'string' },
          },
        }),
        responses: {
          201: okJson('Admin créé', {
            type: 'object',
            properties: { message: { type: 'string' }, admin: User },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/users/admins/{id}': {
      put: {
        tags: ['Admin - Utilisateurs'],
        summary: 'Modifier un admin',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            nom: { type: 'string' },
            prenom: { type: 'string' },
            telephone: { type: 'string' },
          },
        }),
        responses: {
          200: okJson('Admin modifié', {
            type: 'object',
            properties: { message: { type: 'string' }, admin: User },
          }),
          ...errorResponses,
        },
      },
      delete: {
        tags: ['Admin - Utilisateurs'],
        summary: 'Supprimer un admin',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Supprimé', { type: 'object', properties: { message: { type: 'string' } } }),
          ...errorResponses,
        },
      },
    },
    '/admin/users/admins/{id}/toggle': {
      patch: {
        tags: ['Admin - Utilisateurs'],
        summary: 'Activer/désactiver un admin',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Statut modifié', {
            type: 'object',
            properties: { message: { type: 'string' }, admin: User },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/users/clients': {
      get: {
        tags: ['Admin - Utilisateurs'],
        summary: 'Liste des clients',
        security: bearerAuth,
        responses: {
          200: okJson('Liste', {
            type: 'object',
            properties: { clients: { type: 'array', items: User }, pagination: Pagination },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/users/clients/count': {
      get: {
        tags: ['Admin - Utilisateurs'],
        summary: 'Nombre total de clients',
        security: bearerAuth,
        responses: {
          200: okJson('Total', {
            type: 'object',
            properties: { totalClients: { type: 'integer' } },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/users/clients/export': {
      get: {
        tags: ['Admin - Utilisateurs'],
        summary: 'Export CSV des clients',
        security: bearerAuth,
        responses: {
          200: {
            description: 'Fichier CSV',
            content: { 'text/csv': { schema: { type: 'string' } } },
          },
          ...errorResponses,
        },
      },
    },
    '/admin/users/clients/{id}/activer': {
      patch: {
        tags: ['Admin - Utilisateurs'],
        summary: 'Activer un client',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Client activé', {
            type: 'object',
            properties: { message: { type: 'string' }, client: User },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/users/clients/{id}/desactiver': {
      patch: {
        tags: ['Admin - Utilisateurs'],
        summary: 'Désactiver un client',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Client désactivé', {
            type: 'object',
            properties: { message: { type: 'string' }, client: User },
          }),
          ...errorResponses,
        },
      },
    },

    // ── ADMIN - VENDEURS ─────────────────────────────────────────────────
    '/admin/vendeurs': {
      get: {
        tags: ['Admin - Vendeurs'],
        summary: 'Liste des vendeurs (informations boutique incluses)',
        security: bearerAuth,
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          {
            name: 'statut',
            in: 'query',
            schema: { type: 'string', enum: ['actif', 'bloque'] },
          },
        ],
        responses: {
          200: okJson('Liste des vendeurs', {
            type: 'object',
            properties: {
              vendeurs: { type: 'array', items: Vendeur },
              pagination: Pagination,
            },
          }),
          ...errorResponses,
        },
      },
      post: {
        tags: ['Admin - Vendeurs'],
        summary: 'Créer un vendeur (actif immédiatement, mot de passe envoyé par email)',
        description:
          'Le mot de passe temporaire est généré par le serveur, haché en base et ' +
          'transmis au vendeur par email (Resend). Il devra obligatoirement le ' +
          'changer à sa première connexion.',
        security: bearerAuth,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['nom', 'prenom', 'email', 'nomBoutique'],
                properties: {
                  nom: { type: 'string' },
                  prenom: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  telephone: { type: 'string' },
                  nomBoutique: { type: 'string' },
                  adresseBoutique: { type: 'string' },
                  description: { type: 'string' },
                  infoLegale: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: okJson('Vendeur créé', {
            type: 'object',
            properties: { vendeur: Vendeur, emailEnvoye: { type: 'boolean' } },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/vendeurs/{id}': {
      get: {
        tags: ['Admin - Vendeurs'],
        summary: 'Détail d’un vendeur',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Vendeur', { type: 'object', properties: { vendeur: Vendeur } }),
          ...errorResponses,
        },
      },
      put: {
        tags: ['Admin - Vendeurs'],
        summary: 'Modifier la boutique d’un vendeur',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  nomBoutique: { type: 'string' },
                  adresseBoutique: { type: 'string' },
                  description: { type: 'string' },
                  infoLegale: { type: 'string' },
                  telephone: { type: 'string' },
                  latitude: { type: 'number' },
                  longitude: { type: 'number' },
                },
              },
            },
          },
        },
        responses: { 200: okJson('Profil mis à jour'), ...errorResponses },
      },
    },
    '/admin/vendeurs/{id}/statut': {
      get: {
        tags: ['Admin - Vendeurs'],
        summary: 'Statut courant du vendeur',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Statut du vendeur', {
            type: 'object',
            properties: {
              statut: { type: 'string', enum: ['actif', 'bloque'] },
              isBlocked: { type: 'boolean' },
            },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/vendeurs/{id}/bloquer': {
      patch: {
        tags: ['Admin - Vendeurs'],
        summary: 'Bloquer un vendeur',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Vendeur bloqué', {
            type: 'object',
            properties: {
              statut: { type: 'string', enum: ['bloque'] },
              isBlocked: { type: 'boolean' },
            },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/vendeurs/{id}/debloquer': {
      patch: {
        tags: ['Admin - Vendeurs'],
        summary: 'Débloquer un vendeur',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Vendeur débloqué', {
            type: 'object',
            properties: {
              statut: { type: 'string', enum: ['actif'] },
              isBlocked: { type: 'boolean' },
            },
          }),
          ...errorResponses,
        },
      },
    },

    // ── ADMIN - CATÉGORIES ───────────────────────────────────────────────
    '/admin/categories': {
      get: {
        tags: ['Admin - Catégories'],
        summary: 'Arbre des catégories',
        security: bearerAuth,
        responses: {
          200: okJson('Liste', {
            type: 'object',
            properties: { categories: { type: 'array', items: Categorie } },
          }),
          ...errorResponses,
        },
      },
      post: {
        tags: ['Admin - Catégories'],
        summary: 'Créer une catégorie (multipart, image optionnelle)',
        security: bearerAuth,
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['nom'],
                properties: {
                  nom: { type: 'string' },
                  description: { type: 'string' },
                  parentId: { type: 'string' },
                  image: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          201: okJson('Catégorie créée', {
            type: 'object',
            properties: { message: { type: 'string' }, categorie: Categorie },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/categories/{id}': {
      get: {
        tags: ['Admin - Catégories'],
        summary: 'Détail catégorie + produits actifs',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Catégorie', { type: 'object', properties: { categorie: Categorie } }),
          ...errorResponses,
        },
      },
      put: {
        tags: ['Admin - Catégories'],
        summary: 'Modifier une catégorie (multipart, image optionnelle)',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  nom: { type: 'string' },
                  description: { type: 'string' },
                  parentId: { type: 'string' },
                  isActive: { type: 'boolean' },
                  image: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          200: okJson('Catégorie modifiée', {
            type: 'object',
            properties: { message: { type: 'string' }, categorie: Categorie },
          }),
          ...errorResponses,
        },
      },
      delete: {
        tags: ['Admin - Catégories'],
        summary: 'Supprimer une catégorie (si aucun produit actif)',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Supprimée', { type: 'object', properties: { message: { type: 'string' } } }),
          ...errorResponses,
        },
      },
    },

    // ── ADMIN - PRODUITS ─────────────────────────────────────────────────
    '/admin/produits': {
      get: {
        tags: ['Admin - Produits'],
        summary: 'Liste des produits (filtres, pagination)',
        security: bearerAuth,
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'rayonId', in: 'query', schema: { type: 'string' } },
          { name: 'sousRayonId', in: 'query', schema: { type: 'string' } },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
          { name: 'isFeatured', in: 'query', schema: { type: 'boolean' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: okJson('Liste', {
            type: 'object',
            properties: { produits: { type: 'array', items: Produit }, pagination: Pagination },
          }),
          ...errorResponses,
        },
      },
      post: {
        tags: ['Admin - Produits'],
        summary: "Créer un produit (multipart, jusqu'à 5 images)",
        security: bearerAuth,
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['nom', 'prix', 'rayonId', 'sousRayonId'],
                properties: {
                  nom: { type: 'string' },
                  description: { type: 'string' },
                  prix: { type: 'number' },
                  prixPromo: { type: 'number' },
                  stock: { type: 'integer' },
                  rayonId: { type: 'string', format: 'uuid' },
                  sousRayonId: { type: 'string', format: 'uuid' },
                  poids: { type: 'number' },
                  reference: { type: 'string' },
                  isFeatured: { type: 'boolean' },
                  images: { type: 'array', items: { type: 'string', format: 'binary' } },
                },
              },
            },
          },
        },
        responses: {
          201: okJson('Produit créé', {
            type: 'object',
            properties: { message: { type: 'string' }, produit: Produit },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/produits/{id}': {
      get: {
        tags: ['Admin - Produits'],
        summary: 'Détail produit',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Produit', { type: 'object', properties: { produit: Produit } }),
          ...errorResponses,
        },
      },
      put: {
        tags: ['Admin - Produits'],
        summary: 'Modifier un produit (multipart, images optionnelles)',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  nom: { type: 'string' },
                  description: { type: 'string' },
                  prix: { type: 'number' },
                  prixPromo: { type: 'number' },
                  stock: { type: 'integer' },
                  rayonId: { type: 'string', format: 'uuid' },
                  sousRayonId: { type: 'string', format: 'uuid' },
                  isActive: { type: 'boolean' },
                  isFeatured: { type: 'boolean' },
                  images: { type: 'array', items: { type: 'string', format: 'binary' } },
                },
              },
            },
          },
        },
        responses: {
          200: okJson('Produit modifié', {
            type: 'object',
            properties: { message: { type: 'string' }, produit: Produit },
          }),
          ...errorResponses,
        },
      },
      delete: {
        tags: ['Admin - Produits'],
        summary: 'Désactiver un produit (soft delete)',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Désactivé', { type: 'object', properties: { message: { type: 'string' } } }),
          ...errorResponses,
        },
      },
    },
    '/admin/produits/{id}/stock': {
      patch: {
        tags: ['Admin - Produits'],
        summary: 'Mettre à jour le stock (valeur absolue)',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: jsonBody({
          type: 'object',
          required: ['quantite'],
          properties: { quantite: { type: 'integer' } },
        }),
        responses: {
          200: okJson('Stock modifié', {
            type: 'object',
            properties: { message: { type: 'string' }, produit: Produit },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/produits/{id}/featured': {
      patch: {
        tags: ['Admin - Produits'],
        summary: 'Basculer isFeatured',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Modifié', {
            type: 'object',
            properties: { message: { type: 'string' }, produit: Produit },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/produits/{id}/visibilite': {
      patch: {
        tags: ['Admin - Produits'],
        summary: 'Basculer isActive',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Modifié', {
            type: 'object',
            properties: { message: { type: 'string' }, produit: Produit },
          }),
          ...errorResponses,
        },
      },
    },

    // ── ADMIN - COMMANDES ────────────────────────────────────────────────
    '/admin/commandes': {
      get: {
        tags: ['Admin - Commandes'],
        summary: 'Liste des commandes (filtres, pagination)',
        security: bearerAuth,
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'statut', in: 'query', schema: { type: 'string' } },
          { name: 'userId', in: 'query', schema: { type: 'string' } },
          { name: 'reference', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: okJson('Liste', {
            type: 'object',
            properties: { commandes: { type: 'array', items: Commande }, pagination: Pagination },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/commandes/export': {
      get: {
        tags: ['Admin - Commandes'],
        summary: 'Export CSV des commandes',
        security: bearerAuth,
        responses: {
          200: {
            description: 'Fichier CSV',
            content: { 'text/csv': { schema: { type: 'string' } } },
          },
          ...errorResponses,
        },
      },
    },
    '/admin/commandes/{id}': {
      get: {
        tags: ['Admin - Commandes'],
        summary: 'Détail commande',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Commande', { type: 'object', properties: { commande: Commande } }),
          ...errorResponses,
        },
      },
    },
    '/admin/commandes/{id}/valider': {
      patch: {
        tags: ['Admin - Commandes'],
        summary: 'Valider une commande en_attente',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: jsonBody({ type: 'object', properties: { noteAdmin: { type: 'string' } } }),
        responses: {
          200: okJson('Validée', {
            type: 'object',
            properties: { message: { type: 'string' }, commande: Commande },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/commandes/{id}/rejeter': {
      patch: {
        tags: ['Admin - Commandes'],
        summary: 'Rejeter/annuler une commande (remet le stock)',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: jsonBody({
          type: 'object',
          required: ['raison'],
          properties: { raison: { type: 'string' } },
        }),
        responses: {
          200: okJson('Rejetée', {
            type: 'object',
            properties: { message: { type: 'string' }, commande: Commande },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/commandes/{id}/preparation': {
      patch: {
        tags: ['Admin - Commandes'],
        summary: 'Passer en préparation',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Modifiée', {
            type: 'object',
            properties: { message: { type: 'string' }, commande: Commande },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/commandes/{id}/expedier': {
      patch: {
        tags: ['Admin - Commandes'],
        summary: 'Marquer comme expédiée',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: jsonBody({ type: 'object', properties: { trackingInfo: { type: 'string' } } }),
        responses: {
          200: okJson('Modifiée', {
            type: 'object',
            properties: { message: { type: 'string' }, commande: Commande },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/commandes/{id}/livrer': {
      patch: {
        tags: ['Admin - Commandes'],
        summary: 'Marquer comme livrée',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Modifiée', {
            type: 'object',
            properties: { message: { type: 'string' }, commande: Commande },
          }),
          ...errorResponses,
        },
      },
    },

    // ── ADMIN - PAIEMENTS ────────────────────────────────────────────────
    '/admin/paiements': {
      get: {
        tags: ['Admin - Paiements'],
        summary: 'Liste des paiements (filtres)',
        security: bearerAuth,
        parameters: [
          { name: 'statut', in: 'query', schema: { type: 'string' } },
          { name: 'methode', in: 'query', schema: { type: 'string' } },
          { name: 'userId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: okJson('Liste', {
            type: 'object',
            properties: { paiements: { type: 'array', items: Paiement }, pagination: Pagination },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/paiements/{id}': {
      get: {
        tags: ['Admin - Paiements'],
        summary: 'Détail paiement',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Paiement', { type: 'object', properties: { paiement: Paiement } }),
          ...errorResponses,
        },
      },
    },
    '/admin/paiements/{id}/confirmer': {
      patch: {
        tags: ['Admin - Paiements'],
        summary: 'Confirmer un paiement en_attente (manuel)',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: jsonBody({
          type: 'object',
          properties: { transactionId: { type: 'string' } },
        }),
        responses: {
          200: okJson('Confirmé', {
            type: 'object',
            properties: { message: { type: 'string' }, paiement: Paiement },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/paiements/{id}/rembourser': {
      patch: {
        tags: ['Admin - Paiements'],
        summary: 'Rembourser un paiement réussi',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: jsonBody({ type: 'object', properties: { raison: { type: 'string' } } }),
        responses: {
          200: okJson('Remboursé', {
            type: 'object',
            properties: { message: { type: 'string' }, paiement: Paiement },
          }),
          ...errorResponses,
        },
      },
    },

    // ── ADMIN - AVIS ─────────────────────────────────────────────────────
    '/admin/avis': {
      get: {
        tags: ['Admin - Avis'],
        summary: 'Liste des avis (filtres)',
        security: bearerAuth,
        parameters: [
          { name: 'isApproved', in: 'query', schema: { type: 'boolean' } },
          { name: 'produitId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: okJson('Liste', {
            type: 'object',
            properties: { avis: { type: 'array', items: Avis } },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/avis/{id}/approuver': {
      patch: {
        tags: ['Admin - Avis'],
        summary: 'Approuver un avis',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Approuvé', {
            type: 'object',
            properties: { message: { type: 'string' }, avis: Avis },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/avis/{id}': {
      delete: {
        tags: ['Admin - Avis'],
        summary: 'Rejeter/supprimer un avis',
        security: bearerAuth,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: okJson('Supprimé', { type: 'object', properties: { message: { type: 'string' } } }),
          ...errorResponses,
        },
      },
    },

    // ── ADMIN - DASHBOARD ────────────────────────────────────────────────
    '/admin/dashboard/stats': {
      get: {
        tags: ['Admin - Dashboard'],
        summary: 'Statistiques globales',
        security: bearerAuth,
        responses: {
          200: okJson('Stats', {
            type: 'object',
            properties: {
              totalClients: { type: 'integer' },
              totalProduits: { type: 'integer' },
              totalCommandes: { type: 'integer' },
              chiffreAffaires: { type: 'number' },
            },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/dashboard/commandes-statut': {
      get: {
        tags: ['Admin - Dashboard'],
        summary: 'Répartition des commandes par statut',
        security: bearerAuth,
        responses: {
          200: okJson('Stats', {
            type: 'object',
            properties: {
              stats: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { statut: { type: 'string' }, count: { type: 'integer' } },
                },
              },
            },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/dashboard/revenus': {
      get: {
        tags: ['Admin - Dashboard'],
        summary: 'Revenus par mois (commandes livrées)',
        security: bearerAuth,
        parameters: [{ name: 'annee', in: 'query', schema: { type: 'integer' } }],
        responses: {
          200: okJson('Stats', {
            type: 'object',
            properties: {
              revenus: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { mois: { type: 'integer' }, revenus: { type: 'number' } },
                },
              },
            },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/dashboard/top-produits': {
      get: {
        tags: ['Admin - Dashboard'],
        summary: 'Produits les plus vendus',
        security: bearerAuth,
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
        responses: {
          200: okJson('Stats', { type: 'object', properties: { produits: { type: 'array' } } }),
          ...errorResponses,
        },
      },
    },
    '/admin/dashboard/clients-actifs': {
      get: {
        tags: ['Admin - Dashboard'],
        summary: 'Clients les plus actifs',
        security: bearerAuth,
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
        responses: {
          200: okJson('Stats', { type: 'object', properties: { clients: { type: 'array' } } }),
          ...errorResponses,
        },
      },
    },
    '/admin/dashboard/commandes-recentes': {
      get: {
        tags: ['Admin - Dashboard'],
        summary: 'Dernières commandes',
        security: bearerAuth,
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
        responses: {
          200: okJson('Liste', {
            type: 'object',
            properties: { commandes: { type: 'array', items: Commande } },
          }),
          ...errorResponses,
        },
      },
    },
    '/admin/dashboard/stock-alertes': {
      get: {
        tags: ['Admin - Dashboard'],
        summary: 'Produits en rupture proche',
        security: bearerAuth,
        parameters: [{ name: 'seuil', in: 'query', schema: { type: 'integer' } }],
        responses: {
          200: okJson('Liste', {
            type: 'object',
            properties: { produits: { type: 'array', items: Produit } },
          }),
          ...errorResponses,
        },
      },
    },
  },
};
