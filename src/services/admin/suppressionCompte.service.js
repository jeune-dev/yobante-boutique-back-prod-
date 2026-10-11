'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const {
  User,
  Commande,
  CommandeItem,
  Produit,
  ProfilVendeur,
  RefreshToken,
  DeviceToken,
  UserOtp,
  Panier,
  Favori,
  Notification,
  sequelize,
} = require('../../models');
const { ROLES, STATUT_COMMANDE } = require('../../constants');

// Une commande encore en cours engage le client ou le vendeur : on ne
// supprime pas son compte tant qu'elle n'est pas livrée ou annulée.
const STATUTS_EN_COURS = [
  STATUT_COMMANDE.EN_ATTENTE,
  STATUT_COMMANDE.VALIDEE,
  STATUT_COMMANDE.EN_PREPARATION,
  STATUT_COMMANDE.EXPEDIEE,
];

const LIBELLES = { [ROLES.CLIENT]: 'Client', [ROLES.VENDEUR]: 'Vendeur' };

/**
 * Suppression d'un compte client ou vendeur depuis le dashboard.
 *
 * Effacer la ligne `users` supprimerait en cascade les commandes, paiements et
 * reversements : l'historique comptable serait perdu. Le compte est donc
 * anonymisé (nom, email, téléphone, photo), son mot de passe rendu inutilisable,
 * ses sessions et appareils retirés, et il disparaît des listes. L'adresse
 * email est libérée : la personne pourra se réinscrire.
 */
class SuppressionCompteService {
  static async supprimer(id, role) {
    const libelle = LIBELLES[role];
    const user = await User.findOne({ where: { id, role, supprimeLe: null } });
    if (!user) return { success: false, status: 404, message: `${libelle} introuvable` };

    const enCours = await SuppressionCompteService.#commandesEnCours(id, role);
    if (enCours > 0) {
      return {
        success: false,
        status: 409,
        message:
          `Ce compte a ${enCours} commande${enCours > 1 ? 's' : ''} en cours. ` +
          'Livrez-les ou annulez-les avant de supprimer le compte.',
      };
    }

    const nomAvant = `${user.prenom} ${user.nom}`.trim();
    const motDePasseInutilisable = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    await sequelize.transaction(async (transaction) => {
      await user.update(
        {
          nom: 'supprimé',
          prenom: 'Compte',
          email: `supprime-${user.id}@compte-supprime.yobante.com`,
          telephone: null,
          avatar: null,
          password: motDePasseInutilisable,
          isActive: false,
          isVerified: false,
          mustChangePassword: false,
          supprimeLe: new Date(),
        },
        { transaction, hooks: false }
      );

      const parUtilisateur = { where: { userId: id }, transaction };
      await Promise.all([
        RefreshToken.destroy(parUtilisateur),
        DeviceToken.destroy(parUtilisateur),
        UserOtp.destroy(parUtilisateur),
        Panier.destroy(parUtilisateur),
        Favori.destroy(parUtilisateur),
        Notification.destroy(parUtilisateur),
      ]);

      if (role === ROLES.VENDEUR) {
        // Ses produits quittent le catalogue ; les lignes de commandes passées
        // les référencent toujours.
        await Produit.update({ isActive: false }, { where: { vendeurId: id }, transaction });
        await ProfilVendeur.update({ isActive: false }, parUtilisateur);
      }
    });

    return { success: true, message: `Le compte de ${nomAvant} a été supprimé` };
  }

  static #commandesEnCours(id, role) {
    if (role === ROLES.CLIENT) {
      return Commande.count({ where: { userId: id, statut: { [Op.in]: STATUTS_EN_COURS } } });
    }
    return Commande.count({
      where: { statut: { [Op.in]: STATUTS_EN_COURS } },
      distinct: true,
      include: [
        {
          model: CommandeItem,
          as: 'items',
          attributes: [],
          required: true,
          include: [
            {
              model: Produit,
              as: 'produit',
              attributes: [],
              where: { vendeurId: id },
              required: true,
            },
          ],
        },
      ],
    });
  }
}

module.exports = SuppressionCompteService;
