// ─────────────────────────────────────────────────────────────
// utils/mailer.js — Service d'envoi d'emails (Resend)
// ─────────────────────────────────────────────────────────────
const { Resend } = require('resend');
const logger = require('./logger');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.MAIL_FROM || 'onboarding@resend.dev';

async function sendMail({ to, subject, html }) {
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
    html: `<p>Votre code de vérification est : <strong>${code}</strong></p><p>Ce code expire dans 1 heure.</p>`,
  });
}

function sendWelcomeEmail(to, nom) {
  return sendMail({
    to,
    subject: 'Bienvenue chez Yobante Boutique',
    html: `<p>Bonjour ${nom}, bienvenue chez Yobante Boutique !</p>`,
  });
}

function sendResetPasswordEmail(to, code) {
  return sendMail({
    to,
    subject: 'Réinitialisation de votre mot de passe — Yobante',
    html: `<p>Votre code de réinitialisation est : <strong>${code}</strong></p><p>Ce code expire dans 10 minutes.</p>`,
  });
}

function sendCommandeConfirmation(to, commande) {
  return sendMail({
    to,
    subject: `Confirmation de votre commande ${commande.reference}`,
    html: `<p>Votre commande <strong>${commande.reference}</strong> a été confirmée.</p><p>Montant total : ${commande.montantTotal} €</p>`,
  });
}

function sendCommandeStatut(to, commande, statut) {
  const libelles = {
    validee: 'validée',
    en_preparation: 'en cours de préparation',
    expediee: 'expédiée',
    livree: 'livrée',
    annulee: 'annulée',
  };
  return sendMail({
    to,
    subject: `Mise à jour de votre commande ${commande.reference}`,
    html: `<p>Votre commande <strong>${commande.reference}</strong> est maintenant <strong>${libelles[statut] || statut}</strong>.</p>`,
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
  sendOtpEmail,
  sendWelcomeEmail,
  sendResetPasswordEmail,
  sendCommandeConfirmation,
  sendCommandeStatut,
  sendDemandeSuppressionCompteEmail,
};
