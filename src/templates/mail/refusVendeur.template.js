// ─────────────────────────────────────────────────────────────
// templates/mail/refusVendeur.template.js
// Email aux administrateurs : un vendeur indique qu'un ou plusieurs produits
// d'une commande ne sont pas disponibles chez lui, avec son motif.
// ─────────────────────────────────────────────────────────────

const { miseEnPage, echapper } = require('./miseEnPage');

module.exports = ({ reference, vendeur, boutique, telephone, produits = [], motif, lien }) =>
  miseEnPage(`
      <p style="font-size:16px;font-weight:bold;margin:0 0 12px;color:#B42318">Produit indisponible chez un vendeur</p>
      <p style="margin:0 0 16px">
        Le vendeur <strong>${echapper(vendeur)}</strong>${boutique ? ` (boutique <strong>${echapper(boutique)}</strong>)` : ''}
        indique que ses produits de la commande <strong>${echapper(reference)}</strong> ne sont pas disponibles.
      </p>
      <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px">
        <tr><td style="padding:8px 0;color:#616161;width:120px;vertical-align:top">Produits</td><td style="padding:8px 0">${produits.map(echapper).join('<br>') || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#616161;vertical-align:top;border-top:1px solid #EEF1F6">Motif</td><td style="padding:8px 0;border-top:1px solid #EEF1F6"><strong>${echapper(motif)}</strong></td></tr>
        ${telephone ? `<tr><td style="padding:8px 0;color:#616161;border-top:1px solid #EEF1F6">Téléphone</td><td style="padding:8px 0;border-top:1px solid #EEF1F6">${echapper(telephone)}</td></tr>` : ''}
      </table>
      <p style="margin:0 0 20px;color:#616161;font-size:13px">
        Il faut prévenir le client, trouver une alternative ou annuler ces articles.
      </p>
      <a href="${echapper(lien)}" style="display:inline-block;background:#053D8F;color:#FFFFFF;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">Ouvrir la commande</a>
`);
