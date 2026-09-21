// ─────────────────────────────────────────────────────────────
// templates/mail/vendeurAcces.template.js
// Email envoyé à l'utilisateur créé par un administrateur : il contient
// le mot de passe temporaire, à changer obligatoirement à la
// première connexion.
// ─────────────────────────────────────────────────────────────

const echapper = (valeur) =>
  String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

module.exports = ({
  nom,
  prenom,
  email,
  telephone,
  motDePasseTemporaire,
  lienConnexion,
  role = 'vendeur',
}) => `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#111827">
  <h2 style="color:#111827">Bonjour ${echapper(prenom)} ${echapper(nom)},</h2>
  <p>Un compte <strong>${echapper(role)}</strong> vient d'être créé pour vous sur <strong>Yobante Boutique</strong>.</p>
  <p>Voici vos identifiants de connexion :</p>
  <table style="border-collapse:collapse;width:100%;border:1px solid #e5e7eb">
    <tr style="background:#f9fafb">
      <td style="padding:10px;font-weight:bold;border:1px solid #e5e7eb">Lien de connexion</td>
      <td style="padding:10px;border:1px solid #e5e7eb">
        <a href="${echapper(lienConnexion)}" style="color:#f59e0b">${echapper(lienConnexion)}</a>
      </td>
    </tr>
    <tr>
      <td style="padding:10px;font-weight:bold;border:1px solid #e5e7eb">Identifiant (email)</td>
      <td style="padding:10px;border:1px solid #e5e7eb">${echapper(email)}</td>
    </tr>
    ${
      telephone
        ? `
    <tr style="background:#f9fafb">
      <td style="padding:10px;font-weight:bold;border:1px solid #e5e7eb">Téléphone</td>
      <td style="padding:10px;border:1px solid #e5e7eb">${echapper(telephone)}</td>
    </tr>`
        : ''
    }
    <tr>
      <td style="padding:10px;font-weight:bold;border:1px solid #e5e7eb">Mot de passe temporaire</td>
      <td style="padding:10px;border:1px solid #e5e7eb;font-family:monospace;font-size:18px;letter-spacing:2px">
        <strong>${echapper(motDePasseTemporaire)}</strong>
      </td>
    </tr>
  </table>
  <p style="margin-top:16px;padding:12px;background:#fef2f2;border-left:4px solid #dc2626;color:#991b1b">
    <strong>Important :</strong> ce mot de passe est temporaire. Lors de votre première connexion,
    vous devrez obligatoirement le remplacer avant d'accéder à votre espace ${echapper(role)}.
  </p>
  <p>À bientôt sur Yobante Boutique !</p>
</div>
`;
