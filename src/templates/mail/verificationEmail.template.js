// ─────────────────────────────────────────────────────────────
// templates/mail/verificationEmail.template.js
// Email envoyé à la création d'un compte client : code à 6 chiffres
// à saisir dans l'application pour confirmer l'adresse email.
// ─────────────────────────────────────────────────────────────

const { entete } = require('./miseEnPage');

const echapper = (valeur) =>
  String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

module.exports = ({ prenom, code, minutes }) => {
  // Chiffres séparés : plus lisibles, et recopiables un à un.
  const chiffres = String(code)
    .split('')
    .map(
      (c) =>
        `<td style="width:44px;height:54px;background:#E7EDF6;border-radius:10px;text-align:center;font-size:26px;font-weight:bold;color:#053D8F;font-family:Arial,Helvetica,sans-serif">${echapper(c)}</td>`
    )
    .join('<td style="width:8px"></td>');

  return `
<div style="background:#F5F7FB;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1C1C1E">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden">
${entete()}
    <div style="padding:24px">
      <p style="font-size:16px;margin:0 0 12px">Bonjour ${echapper(prenom)},</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 20px">
        Merci pour votre inscription ! Pour confirmer votre adresse email, saisissez ce code
        dans l'application :
      </p>
      <table role="presentation" style="border-collapse:separate;margin:0 auto 20px"><tr>${chiffres}</tr></table>
      <p style="font-size:13px;color:#616161;line-height:1.6;margin:0 0 8px">
        Ce code expire dans <strong>${echapper(minutes)} minutes</strong>. Vous pouvez en demander
        un nouveau depuis l'application.
      </p>
      <p style="font-size:13px;color:#616161;line-height:1.6;margin:0">
        Vous n'êtes pas à l'origine de cette inscription ? Ignorez simplement cet email.
      </p>
    </div>
  </div>
  <p style="text-align:center;font-size:11px;color:#9AA3B2;margin-top:14px">© Yobante Boutique</p>
</div>
`;
};
