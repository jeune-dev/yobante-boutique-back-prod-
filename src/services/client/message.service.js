// ─────────────────────────────────────────────────────────────
// services/client/message.service.js — Messagerie 1:1 acheteur ↔ vendeur
// ─────────────────────────────────────────────────────────────
const { Message, User, sequelize } = require('../../models');
const { QueryTypes, Op } = require('sequelize');
const { NotFoundError } = require('../../errors/AppError');

const USER_ATTRS = ['id', 'nom', 'prenom', 'avatar'];

class MessageService {
  static serialiser(m) {
    return {
      id: m.id,
      expediteurId: m.expediteurId,
      destinataireId: m.destinataireId,
      contenu: m.contenu,
      lu: m.lu,
      createdAt: m.createdAt,
    };
  }

  /** Envoie un message et le renvoie sérialisé. */
  static async envoyerMessage(expediteurId, { destinataireId, contenu }) {
    const message = await Message.create({ expediteurId, destinataireId, contenu });
    return { success: true, message: MessageService.serialiser(message) };
  }

  /**
   * Liste des conversations d'un utilisateur : un interlocuteur par ligne,
   * avec le dernier message échangé et le nombre de messages non lus reçus
   * de sa part. Requête paramétrée (aucune injection possible).
   */
  static async conversations(userId) {
    const rows = await sequelize.query(
      `
      WITH derniers AS (
        SELECT DISTINCT ON (interlocuteur_id)
          interlocuteur_id,
          m.id, m.contenu, m."createdAt"
        FROM (
          SELECT
            CASE WHEN "expediteurId" = :userId THEN "destinataireId" ELSE "expediteurId" END AS interlocuteur_id,
            id, contenu, "createdAt"
          FROM messages
          WHERE "expediteurId" = :userId OR "destinataireId" = :userId
        ) m
        ORDER BY interlocuteur_id, "createdAt" DESC
      ),
      non_lus AS (
        SELECT "expediteurId" AS interlocuteur_id, COUNT(*)::int AS nombre
        FROM messages
        WHERE "destinataireId" = :userId AND lu = false
        GROUP BY "expediteurId"
      )
      SELECT
        d.interlocuteur_id AS "interlocuteurId",
        u.nom AS "interlocuteurNom", u.prenom AS "interlocuteurPrenom",
        u.avatar AS "interlocuteurPhoto",
        d.contenu AS "dernierMessageContenu", d."createdAt" AS "dernierMessageDate",
        COALESCE(nl.nombre, 0) AS "nombreNonLus"
      FROM derniers d
      INNER JOIN users u ON u.id = d.interlocuteur_id
      LEFT JOIN non_lus nl ON nl.interlocuteur_id = d.interlocuteur_id
      ORDER BY d."createdAt" DESC
      `,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );

    const conversations = rows.map((r) => ({
      interlocuteurId: r.interlocuteurId,
      interlocuteur: {
        id: r.interlocuteurId,
        nom: r.interlocuteurNom,
        prenom: r.interlocuteurPrenom,
        photoProfil: r.interlocuteurPhoto,
      },
      dernierMessage: { contenu: r.dernierMessageContenu, createdAt: r.dernierMessageDate },
      nombreNonLus: r.nombreNonLus,
    }));

    return { success: true, conversations };
  }

  /** Historique des messages échangés entre l'utilisateur courant et un interlocuteur. */
  static async historique(userId, interlocuteurId) {
    const interlocuteur = await User.findByPk(interlocuteurId, { attributes: USER_ATTRS });
    if (!interlocuteur) {
      throw new NotFoundError('Utilisateur introuvable');
    }

    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { expediteurId: userId, destinataireId: interlocuteurId },
          { expediteurId: interlocuteurId, destinataireId: userId },
        ],
      },
      order: [['createdAt', 'ASC']],
    });

    return { success: true, messages: messages.map(MessageService.serialiser) };
  }

  /** Marque un message comme lu — uniquement le destinataire peut le faire. */
  static async marquerLu(messageId, userId) {
    const message = await Message.findOne({ where: { id: messageId, destinataireId: userId } });
    if (!message) {
      throw new NotFoundError('Message introuvable');
    }
    if (!message.lu) {
      message.lu = true;
      await message.save();
    }
    return { success: true };
  }

  /** Nombre total de messages non lus reçus par l'utilisateur. */
  static async nombreNonLus(userId) {
    const nombre = await Message.count({ where: { destinataireId: userId, lu: false } });
    return { success: true, nombre };
  }
}

module.exports = MessageService;
