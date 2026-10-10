// ─────────────────────────────────────────────────────────────
// templates/mail/vendeurAcces.template.js
// Email envoyé au vendeur dont le compte est créé par un administrateur :
// identifiant et mot de passe, à utiliser dans l'APPLICATION MOBILE
// Yobante Boutique (l'espace vendeur n'existe pas sur le dashboard web).
// ─────────────────────────────────────────────────────────────

const { entete } = require('./miseEnPage');

const echapper = (valeur) =>
  String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const ligne = (libelle, valeur, { monospace = false, fond = false } = {}) => `
    <tr style="background:${fond ? '#F7F9FC' : '#FFFFFF'}">
      <td style="padding:12px;font-size:13px;color:#616161;border-bottom:1px solid #E3E8F0;width:42%">${libelle}</td>
      <td style="padding:12px;font-size:${monospace ? '17px' : '14px'};font-weight:bold;color:#1C1C1E;border-bottom:1px solid #E3E8F0;${
        monospace ? 'font-family:Consolas,Menlo,monospace;letter-spacing:1px' : ''
      }">${valeur}</td>
    </tr>`;

/**
 * @param {object} p
 * @param {string} p.nom
 * @param {string} p.prenom
 * @param {string} p.email           identifiant de connexion
 * @param {string} [p.telephone]     identifiant alternatif
 * @param {string} p.motDePasse
 * @param {boolean} [p.temporaire]   vrai pour un mot de passe régénéré (« Renvoyer les identifiants ») :
 *                                   le vendeur devra le changer à la connexion
 * @param {string} [p.nomBoutique]
 */
module.exports = ({
  nom,
  prenom,
  email,
  telephone,
  motDePasse,
  temporaire = false,
  nomBoutique,
}) => `
<div style="background:#F5F7FB;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1C1C1E">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden">
${entete()}
    <div style="padding:24px">
      <p style="font-size:16px;margin:0 0 12px">Bonjour ${echapper(prenom)} ${echapper(nom)},</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 18px">
        ${
          temporaire
            ? 'Voici vos nouveaux identifiants pour votre espace vendeur'
            : 'Votre compte vendeur a été créé'
        }${nomBoutique ? ` pour la boutique <strong>${echapper(nomBoutique)}</strong>` : ''}.
        Connectez-vous depuis <strong>l'application mobile Yobante Boutique</strong> pour gérer
        vos produits, vos commandes et vos ventes.
      </p>

      <table role="presentation" style="border-collapse:collapse;width:100%;border:1px solid #E3E8F0;border-radius:12px;overflow:hidden">
        ${ligne('Identifiant (email)', echapper(email), { fond: true })}
        ${telephone ? ligne('ou téléphone', echapper(telephone)) : ''}
        ${ligne('Mot de passe', echapper(motDePasse), { monospace: true, fond: true })}
      </table>

      <div style="margin-top:20px;padding:14px;background:#E7EDF6;border-radius:12px;font-size:13px;line-height:1.6">
        <strong style="color:#053D8F">Comment vous connecter</strong><br>
        1. Installez l'application <strong>Yobante Boutique</strong> sur votre téléphone.<br>
        2. Touchez <strong>Se connecter</strong> puis saisissez l'identifiant et le mot de passe ci-dessus.<br>
        3. Votre espace vendeur s'ouvre automatiquement.
      </div>

      ${
        temporaire
          ? `<p style="margin-top:16px;padding:12px;background:#FEF6DD;border-left:4px solid #B88A0C;font-size:13px;line-height:1.6">
        Ce mot de passe est <strong>temporaire</strong> : l'application vous demandera d'en choisir un
        nouveau à la connexion.
      </p>`
          : ''
      }

      <p style="font-size:12px;color:#616161;line-height:1.6;margin:16px 0 0">
        L'espace vendeur est disponible uniquement dans l'application mobile : le site
        d'administration est réservé à l'équipe Yobante. Gardez ces identifiants confidentiels.
      </p>
    </div>
  </div>
  <p style="text-align:center;font-size:11px;color:#9AA3B2;margin-top:14px">© Yobante Boutique</p>
</div>
`;
