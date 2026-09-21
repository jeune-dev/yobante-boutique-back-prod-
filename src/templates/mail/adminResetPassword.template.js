// ─────────────────────────────────────────────────────────────
// templates/mail/adminResetPassword.template.js
// ─────────────────────────────────────────────────────────────

const echapper = (valeur) =>
  String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

module.exports = ({ prenom, nom, lienReset }) => `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#111827">
  <h2 style="color:#111827">Bonjour ${echapper(prenom)} ${echapper(nom)},</h2>
  <p>Une demande de réinitialisation du mot de passe de votre compte <strong>administrateur</strong> a été effectuée.</p>
  <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
  <p>Pour définir un nouveau mot de passe, cliquez sur le bouton ci-dessous :</p>
  <div style="text-align:center;margin:24px 0">
    <a href="${echapper(lienReset)}" style="background:#f59e0b;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold">
      Réinitialiser mon mot de passe
    </a>
  </div>
  <p style="font-size:12px;color:#6b7280">Ce lien est valable pendant 10 minutes.</p>
</div>
`;
