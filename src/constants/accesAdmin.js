'use strict';

/**
 * Pages du dashboard qu'un administrateur peut se voir attribuer.
 *
 * `permissions` (colonne users.permissions) vaut :
 *   - null            → accès complet (comportement historique, super-administrateur) ;
 *   - ['produits', …] → uniquement ces pages, côté interface ET côté API.
 *
 * La même liste existe dans le dashboard (src/shared/accesAdmin.ts) : les clés
 * doivent rester identiques.
 */
const PAGES_ADMIN = [
  'dashboard',
  'alertes',
  'produits',
  'rayons',
  'commandes',
  'accueil',
  'demandes',
  'stock',
  'vendeurs',
  'commissions',
  'reversements',
  'clients',
  'reclamations',
  'livraison',
  'retours',
  'finance',
  'paiements',
  'analytics',
  'administrateurs',
  'parametres',
];

/**
 * Accès aux routes /api/v1/admin/<préfixe>.
 *
 * `lecture` (GET) est large : une page lit souvent les données d'autres
 * domaines (la création de commande liste produits et clients, la page
 * Produits liste les rayons…). `ecriture` (POST, PUT, PATCH, DELETE) est
 * réservée aux pages qui gèrent réellement ces données.
 */
const ACCES_API = {
  dashboard: { lecture: ['*'], ecriture: [] },
  categories: { lecture: ['*'], ecriture: ['produits', 'rayons'] },
  produits: {
    lecture: [
      'produits',
      'rayons',
      'commandes',
      'accueil',
      'demandes',
      'stock',
      'alertes',
      'analytics',
      'vendeurs',
    ],
    ecriture: ['produits', 'stock', 'demandes', 'rayons'],
  },
  rayons: {
    lecture: [
      'produits',
      'rayons',
      'commandes',
      'accueil',
      'demandes',
      'stock',
      'alertes',
      'analytics',
    ],
    ecriture: ['rayons'],
  },
  commandes: {
    lecture: [
      'commandes',
      'clients',
      'livraison',
      'retours',
      'alertes',
      'finance',
      'paiements',
      'analytics',
      'vendeurs',
      'dashboard',
    ],
    ecriture: ['commandes', 'livraison', 'retours'],
  },
  paiements: {
    lecture: ['paiements', 'finance', 'commandes'],
    ecriture: ['paiements', 'commandes'],
  },
  avis: {
    lecture: ['produits', 'vendeurs', 'reclamations'],
    ecriture: ['produits', 'reclamations'],
  },
  users: {
    lecture: ['clients', 'commandes', 'analytics', 'dashboard'],
    ecriture: ['clients', 'commandes'],
  },
  vendeurs: {
    lecture: [
      'vendeurs',
      'commissions',
      'reversements',
      'analytics',
      'commandes',
      'produits',
      'demandes',
      'finance',
    ],
    ecriture: ['vendeurs', 'commissions'],
  },
  bannieres: { lecture: ['accueil', 'produits'], ecriture: ['accueil'] },
  promotions: { lecture: ['accueil', 'produits'], ecriture: ['accueil'] },
  'blocs-promo': { lecture: ['accueil', 'produits'], ecriture: ['accueil'] },
  'frais-livraison': {
    lecture: ['parametres', 'commandes', 'livraison'],
    ecriture: ['parametres'],
  },
  signalements: { lecture: ['reclamations', 'alertes'], ecriture: ['reclamations'] },
  retours: {
    lecture: ['retours', 'livraison', 'alertes', 'finance', 'commandes'],
    ecriture: ['retours'],
  },
  analytique: {
    lecture: [
      'dashboard',
      'alertes',
      'analytics',
      'stock',
      'livraison',
      'clients',
      'vendeurs',
      'commissions',
      'finance',
      'produits',
    ],
    ecriture: ['analytics', 'stock'],
  },
  finance: {
    lecture: ['finance', 'commissions', 'reversements', 'paiements', 'analytics', 'vendeurs'],
    ecriture: ['finance', 'commissions', 'reversements'],
  },
};

/** Accès complet : aucune restriction enregistrée. */
const accesComplet = (permissions) => !Array.isArray(permissions);

/**
 * L'administrateur peut-il appeler `methode chemin` ?
 * `chemin` est relatif à /api/v1/admin (ex. « /produits/12/stock »).
 */
function peutAppeler(permissions, methode, chemin) {
  if (accesComplet(permissions)) return true;
  const segments = String(chemin || '/')
    .split('?')[0]
    .split('/')
    .filter(Boolean);
  const prefixe = segments[0] || '';

  // Session et mot de passe : toujours permis.
  if (prefixe === '' || prefixe === 'me' || prefixe === 'auth') return true;

  // Gestion des administrateurs : réservée à la page Administrateurs.
  if (prefixe === 'users' && segments[1] === 'admins') {
    return permissions.includes('administrateurs');
  }

  const regle = ACCES_API[prefixe];
  if (!regle) return false; // route inconnue : refusée par défaut
  const lecture = String(methode).toUpperCase() === 'GET';
  const cles = lecture ? regle.lecture : regle.ecriture;
  return cles.includes('*') || cles.some((c) => permissions.includes(c));
}

/** Nettoie une liste reçue : clés connues, sans doublon. null = accès complet. */
function normaliserPermissions(valeur) {
  if (valeur === null || valeur === undefined) return null;
  if (!Array.isArray(valeur)) return null;
  return [...new Set(valeur.filter((c) => PAGES_ADMIN.includes(c)))];
}

module.exports = { PAGES_ADMIN, ACCES_API, accesComplet, peutAppeler, normaliserPermissions };
