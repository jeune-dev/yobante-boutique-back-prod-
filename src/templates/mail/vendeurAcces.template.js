// ─────────────────────────────────────────────────────────────
// templates/mail/vendeurAcces.template.js
// Email de bienvenue envoyé au vendeur dont le compte est créé par un
// administrateur : identifiant, téléphone et mot de passe, à utiliser dans
// l'APPLICATION MOBILE Yobante Boutique (pas d'espace vendeur sur le web).
// Même présentation que l'email de confirmation d'adresse.
// ─────────────────────────────────────────────────────────────

const { miseEnPage, echapper } = require('./miseEnPage');

/** Une information de connexion : libellé discret, valeur bien lisible. */
const info = (libelle, valeur, { code = false } = {}) => `
      <div style="margin:0 0 14px">
        <div style="font-size:12px;color:#616161;margin:0 0 4px">${libelle}</div>
        ${
          code
            ? `<span style="display:inline-block;background:#E7EDF6;color:#053D8F;border-radius:10px;padding:10px 16px;font-size:20px;font-weight:bold;letter-spacing:2px;font-family:Consolas,Menlo,monospace">${valeur}</span>`
            : `<div style="font-size:16px;font-weight:bold;color:#1C1C1E">${valeur}</div>`
        }
      </div>`;

/**
 * @param {object} p
 * @param {string} p.nom
 * @param {string} p.prenom
 * @param {string} p.email           identifiant de connexion
 * @param {string} [p.telephone]
 * @param {string} p.motDePasse
 * @param {boolean} [p.temporaire]   vrai pour un mot de passe régénéré (« Renvoyer les identifiants ») :
 *                                   l'application demandera d'en choisir un nouveau
 * @param {string} [p.nomBoutique]
 */
module.exports = ({ nom, prenom, email, telephone, motDePasse, temporaire = false, nomBoutique }) =>
  miseEnPage(`
      <p style="font-size:16px;margin:0 0 12px">Bonjour ${echapper(prenom)} ${echapper(nom)},</p>
      <p style="margin:0 0 20px">
        ${
          temporaire
            ? 'Voici vos nouveaux identifiants pour accéder à votre espace vendeur'
            : 'Bienvenue chez <strong>Yobante Boutique</strong> ! Votre compte vendeur est prêt'
        }${nomBoutique ? ` pour la boutique <strong>${echapper(nomBoutique)}</strong>` : ''}.
        Connectez-vous depuis l'application mobile <strong>Yobante Boutique</strong> pour gérer
        vos produits, vos commandes et vos ventes.
      </p>
${info("Nom d'utilisateur", echapper(email))}
${telephone ? info('Numéro de téléphone', echapper(telephone)) : ''}
${info('Mot de passe', echapper(motDePasse), { code: true })}
      <p style="margin:6px 0 0;padding:12px 14px;background:#FEF6DD;border-radius:10px;font-size:13px;line-height:1.6">
        ${
          temporaire
            ? "Ce mot de passe est <strong>temporaire</strong> : l'application vous demandera d'en choisir un nouveau à la connexion."
            : "Vous pouvez modifier ce mot de passe quand vous le souhaitez depuis votre espace vendeur dans l'application : <strong>Compte → Mot de passe</strong>."
        }
      </p>
      <p style="font-size:12px;color:#616161;margin:16px 0 0">
        Gardez ces identifiants confidentiels. L'espace vendeur est disponible uniquement dans
        l'application mobile.
      </p>
`);
