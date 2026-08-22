// ─────────────────────────────────────────────────────────────
// services/client/boutique.service.js
// Liste publique des boutiques (profils vendeurs) pour l'app cliente.
// ─────────────────────────────────────────────────────────────
const { ProfilVendeur, User, sequelize } = require('../../models');
const { QueryTypes } = require('sequelize');

// Include commun pour charger le vendeur (User) d'une boutique.
const USER_INCLUDE = [
  { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'telephone'] },
];

class BoutiqueClientService {
  /**
   * Sérialise un ProfilVendeur (avec son `user`) au format attendu par l'app
   * mobile (BoutiqueModel) : { id, nom, description, localisation, telephone, logo, vendeur }.
   */
  static serialiser(p) {
    return {
      id: p.id,
      nom: p.nomBoutique,
      description: p.description || '',
      localisation: p.adresseBoutique || '',
      telephone: p.telephone || (p.user && p.user.telephone) || null,
      logo: p.logo || null,
      heure_ouverture: null,
      heure_fermeture: null,
      vendeur: p.user
        ? {
            id: p.user.id,
            nom: p.user.nom,
            prenom: p.user.prenom,
            telephone: p.user.telephone,
          }
        : null,
    };
  }

  /** Liste des boutiques (profils vendeurs). */
  static async listeBoutiques() {
    const profils = await ProfilVendeur.findAll({
      include: USER_INCLUDE,
      order: [['createdAt', 'DESC']],
    });

    return { success: true, boutiques: profils.map(BoutiqueClientService.serialiser) };
  }

  /**
   * Boutiques actives dans un rayon (km) autour d'un point, triées par
   * distance. Formule de Haversine calculée en SQL (requête paramétrée —
   * aucune injection possible, lat/lng/rayon sont déjà validés en Joi).
   */
  static async boutiquesProches({ lat, lng, rayon }) {
    const rows = await sequelize.query(
      `
      SELECT * FROM (
        SELECT
          pv.id, pv."nomBoutique", pv.description, pv."adresseBoutique",
          pv.telephone, pv.logo,
          u.id AS "userId", u.nom AS "userNom", u.prenom AS "userPrenom", u.telephone AS "userTelephone",
          (
            6371 * acos(
              LEAST(1, GREATEST(-1,
                cos(radians(:lat)) * cos(radians(pv.latitude)) *
                cos(radians(pv.longitude) - radians(:lng)) +
                sin(radians(:lat)) * sin(radians(pv.latitude))
              ))
            )
          ) AS distance_km
        FROM profils_vendeurs pv
        INNER JOIN users u ON u.id = pv."userId"
        WHERE pv."isActive" = true
          AND pv.latitude IS NOT NULL
          AND pv.longitude IS NOT NULL
      ) sub
      WHERE distance_km <= :rayon
      ORDER BY distance_km ASC
      LIMIT 100
      `,
      { replacements: { lat, lng, rayon }, type: QueryTypes.SELECT }
    );

    const boutiques = rows.map((p) => ({
      id: p.id,
      nom: p.nomBoutique,
      description: p.description || '',
      localisation: p.adresseBoutique || '',
      telephone: p.telephone || p.userTelephone || null,
      logo: p.logo || null,
      heure_ouverture: null,
      heure_fermeture: null,
      vendeur: {
        id: p.userId,
        nom: p.userNom,
        prenom: p.userPrenom,
        telephone: p.userTelephone,
      },
    }));

    return { success: true, boutiques };
  }
}

module.exports = BoutiqueClientService;
