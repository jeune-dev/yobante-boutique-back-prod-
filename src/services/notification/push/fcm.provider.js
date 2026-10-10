'use strict';

const admin = require('firebase-admin');
const logger = require('../../../config/logger');

/**
 * Envoi push via Firebase Cloud Messaging.
 *
 * Activation : renseigner FCM_CREDENTIALS avec le JSON du compte de service
 * Firebase (ou FCM_CREDENTIALS_PATH avec un chemin vers ce fichier). Tant
 * qu'aucun identifiant n'est fourni, l'envoi est journalisé sans échouer : la
 * notification reste enregistrée en base et visible dans l'application.
 */
class FcmProvider {
  constructor() {
    this.nom = 'fcm';
    this._app = null;
    this._initialisationEchouee = false;
  }

  static estConfigure() {
    return Boolean(process.env.FCM_CREDENTIALS || process.env.FCM_CREDENTIALS_PATH);
  }

  /** Charge le compte de service, depuis la variable ou depuis un fichier. */
  #chargerIdentifiants() {
    if (process.env.FCM_CREDENTIALS) {
      return JSON.parse(process.env.FCM_CREDENTIALS);
    }
    // eslint-disable-next-line global-require
    return require(process.env.FCM_CREDENTIALS_PATH);
  }

  /**
   * Initialise l'app Firebase une seule fois. Une erreur de configuration est
   * mémorisée pour ne pas retenter à chaque notification.
   */
  #app() {
    if (this._app || this._initialisationEchouee) return this._app;
    try {
      const identifiants = this.#chargerIdentifiants();
      // `admin.apps` évite une double initialisation en rechargement à chaud.
      this._app =
        admin.apps.length > 0
          ? admin.app()
          : admin.initializeApp({ credential: admin.credential.cert(identifiants) });
    } catch (err) {
      this._initialisationEchouee = true;
      logger.error('FCM : identifiants invalides, push désactivé', { error: err.message });
    }
    return this._app;
  }

  /**
   * @param {object} params
   * @param {string[]} params.tokens  jetons des appareils du destinataire
   * @param {string} params.titre
   * @param {string} params.message
   * @param {object} params.donnees  contexte pour ouvrir le bon écran
   * @returns {Promise<{envoyes:number, ignores:number, invalides?:string[]}>}
   */
  async envoyer({ tokens, titre, message, donnees = {} }) {
    if (!FcmProvider.estConfigure()) {
      logger.debug('Push non envoyé : FCM non configuré', { titre, appareils: tokens.length });
      return { envoyes: 0, ignores: tokens.length, raison: 'fcm_non_configure' };
    }

    const app = this.#app();
    if (!app) return { envoyes: 0, ignores: tokens.length, raison: 'fcm_invalide' };

    // Les données FCM doivent être des chaînes.
    const data = Object.fromEntries(
      Object.entries(donnees).map(([cle, valeur]) => [cle, String(valeur ?? '')])
    );

    const reponse = await admin.messaging(app).sendEachForMulticast({
      tokens,
      notification: { title: titre, body: message },
      data,
      android: {
        // Priorité haute : remise immédiate même téléphone en veille (Doze).
        priority: 'high',
        // Téléphone éteint ou hors réseau : FCM garde le message 7 jours et le
        // délivre au retour du réseau.
        ttl: 7 * 24 * 60 * 60 * 1000,
        notification: {
          // Canal créé par l'application (NotificationService) : importance
          // haute, bandeau + son.
          channelId: 'yobante_general',
          // Pictogramme en silhouette, teinté du bleu Yobante.
          icon: 'ic_notification',
          color: '#053D8F',
          sound: 'default',
          defaultVibrateTimings: true,
          notificationPriority: 'PRIORITY_HIGH',
          // Contenu lisible sur l'écran verrouillé.
          visibility: 'public',
        },
      },
      apns: {
        headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
        payload: { aps: { sound: 'default', badge: 1 } },
      },
    });

    // Les jetons refusés correspondent à des applications désinstallées : les
    // conserver ferait grossir la table et échouer les envois suivants.
    const invalides = [];
    reponse.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        invalides.push(tokens[i]);
      }
    });

    return {
      envoyes: reponse.successCount,
      ignores: reponse.failureCount,
      invalides,
    };
  }
}

module.exports = FcmProvider;
