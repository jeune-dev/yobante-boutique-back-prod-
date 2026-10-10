// ─────────────────────────────────────────────────────────────
// templates/mail/miseEnPage.js
// En-tête et cadre communs aux emails Yobante Boutique : bandeau bleu
// avec le pictogramme de l'application, carte blanche, pied de page.
// ─────────────────────────────────────────────────────────────

// Le pictogramme est servi par le dashboard (yobante-admin/public/email/).
// Une image distante plutôt qu'en pièce jointe : Gmail et Outlook masquent
// souvent les images intégrées en base64.
const LOGO_URL =
  process.env.MAIL_LOGO_URL ||
  `${String(process.env.ADMIN_URL || 'https://admin.yobante-boutique.com').replace(/\/+$/, '')}/email/pictogramme.png`;

const POLICE = 'font-family:Arial,Helvetica,sans-serif';

/** Bandeau bleu : pictogramme + « Yobante Boutique ». */
const entete = () => `
    <div style="background:#053D8F;padding:20px 24px">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
        <td style="vertical-align:middle;padding-right:14px">
          <img src="${LOGO_URL}" width="48" height="48" alt="Yobante Boutique" style="display:block;width:48px;height:48px;border:0;border-radius:12px" />
        </td>
        <td style="vertical-align:middle">
          <div style="color:#FFFFFF;font-size:20px;font-weight:bold;${POLICE}">Yobante Boutique</div>
          <div style="width:36px;height:4px;background:#F6C537;border-radius:2px;margin-top:8px"></div>
        </td>
      </tr></table>
    </div>`;

/** Email complet autour d'un contenu HTML déjà échappé. */
const miseEnPage = (contenu) => `
<div style="background:#F5F7FB;padding:24px 12px;${POLICE};color:#1C1C1E">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden">
${entete()}
    <div style="padding:24px;font-size:14px;line-height:1.6">
      ${contenu}
    </div>
  </div>
  <p style="text-align:center;font-size:11px;color:#9AA3B2;margin-top:14px">© Yobante Boutique</p>
</div>
`;

const echapper = (valeur) =>
  String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Code mis en valeur (vérification, réinitialisation). */
const blocCode = (code) =>
  `<div style="margin:16px 0;text-align:center"><span style="display:inline-block;background:#E7EDF6;color:#053D8F;border-radius:10px;padding:12px 20px;font-size:26px;font-weight:bold;letter-spacing:6px">${echapper(code)}</span></div>`;

module.exports = { LOGO_URL, entete, miseEnPage, echapper, blocCode };
