// ─────────────────────────────────────────────────────────────
// utils/mailer.js — Service d'envoi d'emails (Resend)
// ─────────────────────────────────────────────────────────────
const { Resend } = require('resend');
const logger = require('./logger');
const verificationEmailTemplate = require('../templates/mail/verificationEmail.template');
const { miseEnPage, echapper, blocCode } = require('../templates/mail/miseEnPage');

const montantFcfa = (v) => `${Number(v ?? 0).toLocaleString('fr-FR')} FCFA`;

// Sans clé (tests, poste de développement), le client n'est pas créé :
// `new Resend()` lève à l'import et faisait tomber tout module qui charge
// ce fichier. Les envois sont alors simplement journalisés.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.MAIL_FROM || 'onboarding@resend.dev';

async function sendMail({ to, subject, html }) {
  if (!resend) {
    logger.warn('[mailer] RESEND_API_KEY absente : email non envoyé', { to, subject });
    return null;
  }
  try {
    return await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    logger.error('[mailer] Échec envoi email', { to, subject, error: err.message });
    return null;
  }
}

function sendOtpEmail(to, code) {
  return sendMail({
    to,
    subject: 'Votre code de vérification — Yobante',
    html: miseEnPage(
      `<p style="margin:0">Votre code de vérification :</p>${blocCode(code)}<p style="color:#616161;font-size:13px;margin:0">Ce code expire dans 1 heure.</p>`
    ),
  });
}

/** Code de confirmation de l'adresse email, envoyé à la création du compte. */
function sendVerificationEmail(to, { prenom, code, minutes }) {
  return sendMail({
    to,
    subject: `${code} est votre code de confirmation — Yobante Boutique`,
    html: verificationEmailTemplate({ prenom, code, minutes }),
  });
}

function sendWelcomeEmail(to, nom) {
  return sendMail({
    to,
    subject: 'Bienvenue chez Yobante Boutique',
    html: miseEnPage(
      `<p style="font-size:16px;margin:0 0 12px">Bonjour ${echapper(nom)},</p><p style="margin:0">Bienvenue chez Yobante Boutique ! Votre compte est prêt : bonnes découvertes dans l'application.</p>`
    ),
  });
}

function sendResetPasswordEmail(to, code) {
  return sendMail({
    to,
    subject: 'Réinitialisation de votre mot de passe — Yobante',
    html: miseEnPage(
      `<p style="margin:0">Votre code de réinitialisation du mot de passe :</p>${blocCode(code)}<p style="color:#616161;font-size:13px;margin:0">Ce code expire dans 10 minutes. Vous n'avez rien demandé ? Ignorez cet email : votre mot de passe reste inchangé.</p>`
    ),
  });
}

function sendCommandeConfirmation(to, commande) {
  return sendMail({
    to,
    subject: `Confirmation de votre commande ${commande.reference}`,
    html: miseEnPage(
      `<p style="margin:0 0 8px">Votre commande <strong>${echapper(commande.reference)}</strong> a été confirmée.</p><p style="margin:0">Montant total : <strong>${montantFcfa(commande.montantTotal)}</strong></p>`
    ),
  });
}

function sendCommandeStatut(to, commande, statut) {
  const libelles = {
    validee: 'validée',
    en_preparation: 'en cours de préparation',
    expediee: 'expédiée',
    livree: 'livrée',
    annulee: 'annulée',
    rejetee: 'rejetée',
  };
  return sendMail({
    to,
    subject: `Mise à jour de votre commande ${commande.reference}`,
    html: miseEnPage(
      `<p style="margin:0">Votre commande <strong>${echapper(commande.reference)}</strong> est maintenant <strong>${echapper(libelles[statut] || statut)}</strong>.</p>`
    ),
  });
}

/**
 * Produits d'une commande en rupture de stock, avec le motif et le nouveau
 * montant (le client ne paie que ce qui sera livré).
 */
function sendRuptureStock(to, commande, { produits, motif }) {
  const liste = produits.map((nom) => `<li>${echapper(nom)}</li>`).join('');
  return sendMail({
    to,
    subject: `Produit indisponible dans votre commande ${commande.reference}`,
    html: miseEnPage(
      `<p style="margin:0 0 8px">Nous sommes désolés : ${
        produits.length > 1 ? 'les produits suivants sont' : 'le produit suivant est'
      } en rupture de stock dans votre commande <strong>${echapper(commande.reference)}</strong> :</p>` +
        `<ul style="margin:0 0 8px;padding-left:18px">${liste}</ul>` +
        `<p style="margin:0 0 8px"><strong>Motif :</strong> ${echapper(motif)}</p>` +
        `<p style="margin:0">Nouveau montant de la commande : <strong>${montantFcfa(commande.montantTotal)}</strong>. Le détail est disponible dans l'application.</p>`
    ),
  });
}

function sendDemandeSuppressionCompteEmail(to, { email, objet, demandeId }) {
  return sendMail({
    to,
    subject: `Nouvelle demande de suppression de compte — ${email}`,
    html: `
      <p>Une nouvelle demande de suppression de compte a été soumise via le formulaire public.</p>
      <p><strong>Email du demandeur :</strong> ${email}</p>
      <p><strong>Objet de la demande :</strong></p>
      <p>${objet.replace(/\n/g, '<br>')}</p>
      <p><strong>Identifiant de la demande :</strong> ${demandeId}</p>
    `,
  });
}

module.exports = {
  sendMail,
  sendRuptureStock,
  sendOtpEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
  sendResetPasswordEmail,
  sendCommandeConfirmation,
  sendCommandeStatut,
  sendDemandeSuppressionCompteEmail,
};
