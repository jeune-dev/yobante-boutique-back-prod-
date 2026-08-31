// ─────────────────────────────────────────────────────────────
// services/resend.service.js — Point d'entrée unique des emails
//
// Toute la messagerie transactionnelle passe par ici : une seule
// instance Resend, un seul expéditeur (MAIL_FROM), un seul endroit
// où corriger la journalisation ou le format des logs.
//
// Règle de journalisation : on ne trace JAMAIS le corps de l'email
// (il contient les mots de passe temporaires). En production on ne
// trace même pas l'adresse complète, seulement son domaine.
// ─────────────────────────────────────────────────────────────
const { Resend } = require('resend');
const logger = require('../config/logger');

const FROM = process.env.MAIL_FROM || 'Yobante Boutique <onboarding@resend.dev>';
const isProd = process.env.NODE_ENV === 'production';

let client = null;
const getClient = () => {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
};

const destinataireTrace = (to) => {
  const adresse = Array.isArray(to) ? to[0] : to;
  if (!isProd) return adresse;
  return `*@${String(adresse).split('@')[1] ?? '?'}`;
};

/**
 * Envoi générique.
 * Ne lève jamais : un email qui échoue ne doit pas faire échouer
 * l'opération métier déjà committée. Le retour indique le résultat.
 *
 * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
 */
async function sendEmail({ to, subject, html, attachments = [] }) {
  if (process.env.NODE_ENV === 'test') {
    return { success: true, id: 'test-message-id' };
  }

  const resend = getClient();
  if (!resend) {
    logger.warn('[resend] RESEND_API_KEY absente — email non envoyé', { subject });
    return { success: false, error: 'RESEND_API_KEY non configurée' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
      ...(attachments.length > 0 && { attachments }),
    });

    if (error) {
      logger.error('[resend] Échec envoi email', {
        to: destinataireTrace(to),
        subject,
        error: error.message,
      });
      return { success: false, error: error.message };
    }

    logger.info(`[resend] Email envoyé à ${destinataireTrace(to)} — ${subject}`);
    return { success: true, id: data?.id };
  } catch (err) {
    logger.error('[resend] Exception envoi email', {
      to: destinataireTrace(to),
      subject,
      error: err.message,
    });
    return { success: false, error: err.message };
  }
}

module.exports = { sendEmail, FROM };
