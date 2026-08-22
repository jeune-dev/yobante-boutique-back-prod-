const { DemandeSuppressionCompte } = require('../../models');
const { sendDemandeSuppressionCompteEmail } = require('../../utils/mailer');
const logger = require('../../utils/logger');

// Adresse qui reçoit les notifications de demandes de suppression de compte.
const DESTINATAIRE = process.env.SUPPRESSION_COMPTE_EMAIL || 'ballabeye.dev04@gmail.com';

class SuppressionCompteService {
  static async creerDemande({ email, objet }) {
    const demande = await DemandeSuppressionCompte.create({ email, objet });

    // L'échec d'envoi d'email ne doit pas faire échouer la demande :
    // elle reste enregistrée en base et consultable/traitable manuellement.
    sendDemandeSuppressionCompteEmail(DESTINATAIRE, {
      email,
      objet,
      demandeId: demande.id,
    }).catch((err) =>
      logger.error('[suppressionCompte] Échec notification email', { error: err.message })
    );

    return { success: true, demande };
  }
}

module.exports = SuppressionCompteService;
