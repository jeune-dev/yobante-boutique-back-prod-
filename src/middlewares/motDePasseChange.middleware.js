// ─────────────────────────────────────────────────────────────
// middlewares/motDePasseChange.middleware.js
//
// Tant qu'un utilisateur créé par l'administration n'a pas remplacé son mot
// de passe temporaire, il ne doit accéder à AUCUNE fonctionnalité métier.
// Le contrôle est fait ici, côté serveur : une interface qui « oublierait »
// de rediriger ne doit pas suffire à contourner l'obligation.
//
// Les routes de changement de mot de passe vivent sous /api/v1/auth, qui
// n'est pas couvert par ce middleware : l'utilisateur peut donc toujours
// régulariser sa situation (et se déconnecter).
// ─────────────────────────────────────────────────────────────

const motDePasseChangeMiddleware = (req, res, next) => {
  // Pas d'utilisateur résolu : c'est au middleware d'authentification de
  // trancher, pas ici.
  if (!req.user) return next();

  if (req.user.mustChangePassword) {
    return res.status(403).json({
      success: false,
      message: 'Vous devez changer votre mot de passe temporaire avant de continuer.',
      // Repère machine : les clients redirigent vers l'écran de changement
      // sans avoir à comparer des libellés.
      code: 'MOT_DE_PASSE_A_CHANGER',
      mustChangePassword: true,
      data: null,
    });
  }

  return next();
};

module.exports = motDePasseChangeMiddleware;
