// ─────────────────────────────────────────────────────────────
// controllers/admin/commande.controller.js
// ─────────────────────────────────────────────────────────────
const GestionCommandeService = require('../../services/admin/commande.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.getAllCommandes(req.query);
  return ok(
    res,
    { commandes: result.commandes, pagination: result.pagination },
    'Commandes récupérées'
  );
});

exports.exportCsv = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.exportCommandes(req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="commandes-${Date.now()}.csv"`);
  return res.status(200).send(result.csv);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.getCommandeById(req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  // Réponse des vendeurs (produits disponibles ou non, avec le motif).
  const disponibilitesVendeurs = await GestionCommandeService.getDisponibilitesVendeurs(
    req.params.id
  );
  return ok(
    res,
    {
      commande: {
        ...result.commande.toJSON(),
        disponibilitesVendeurs,
        // Statuts proposés dans le sélecteur de la fiche commande.
        statutsPossibles: GestionCommandeService.statutsPossibles(result.commande.statut),
      },
    },
    'Commande récupérée'
  );
});

exports.annuler = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.annulerCommande(req.params.id, {
    ...req.body,
    adminId: req.user?.id,
  });
  if (!result.success) {
    if (result.status === 404) throw new NotFoundError(result.message);
    throw new BadRequestError(result.message);
  }
  return ok(res, { commande: result.commande }, result.message);
});

exports.modifier = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.modifierCommande(req.params.id, {
    ...req.body,
    adminId: req.user?.id,
  });
  if (!result.success) {
    if (result.status === 404) throw new NotFoundError(result.message);
    throw new BadRequestError(result.message);
  }
  return ok(res, { commande: result.commande, changements: result.changements }, result.message);
});

/**
 * PATCH /admin/commandes/:id/rupture — produits en rupture de stock.
 * Le client est prévenu (notification push, email, page commande) avec le motif.
 */
exports.marquerRupture = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.marquerRupture(req.params.id, {
    ...req.body,
    adminId: req.user?.id,
  });
  if (!result.success) {
    if (result.status === 404) throw new NotFoundError(result.message);
    throw new BadRequestError(result.message);
  }
  return ok(
    res,
    { commande: result.commande, toutEnRupture: result.toutEnRupture },
    result.message
  );
});

exports.getFiabiliteVendeurs = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.getFiabiliteVendeurs(req.query);
  return ok(res, { vendeurs: result.vendeurs }, 'Fiabilité des vendeurs');
});

// Historique complet d'un client, lignes de commande incluses : alimente
// l'onglet « Commandes » de sa fiche.
exports.getParClient = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.getCommandesParClient(req.params.userId);
  return ok(res, { commandes: result.commandes }, 'Commandes du client');
});

exports.valider = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.validerCommande(req.params.id, req.body.noteAdmin);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { commande: result.commande }, result.message);
});

exports.rejeter = asyncHandler(async (req, res) => {
  const motif = req.body.motif ?? req.body.raison;
  // L'auteur du mouvement de stock vient du jeton, jamais du corps.
  const result = await GestionCommandeService.rejeterCommande(req.params.id, motif, req.user?.id);
  if (!result.success) {
    if (result.status === 404) throw new NotFoundError(result.message);
    throw new BadRequestError(result.message);
  }
  return ok(res, { commande: result.commande }, result.message);
});

/**
 * PATCH /admin/commandes/:id/statut — { statut, note? }
 * Statut choisi sur la fiche commande ; le client est notifié (sauf statut
 * interne « en_modification »).
 */
exports.changerStatut = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.changerStatut(req.params.id, req.body.statut, {
    note: req.body.note,
  });
  if (!result.success) {
    if (result.status === 404) throw new NotFoundError(result.message);
    throw new BadRequestError(result.message);
  }
  return ok(res, { commande: result.commande }, result.message);
});

exports.mettreEnPreparation = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.mettreEnPreparation(req.params.id);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { commande: result.commande }, result.message);
});

exports.marquerExpediee = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.marquerExpediee(req.params.id, req.body.trackingInfo);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { commande: result.commande }, result.message);
});

exports.marquerLivree = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.marquerLivree(req.params.id);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { commande: result.commande }, result.message);
});

exports.getKpi = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.getKpiCommandes();
  return ok(res, result.kpi, 'KPI commandes');
});
/**
 * POST /api/v1/admin/commandes
 * Création d'une commande par un administrateur pour le compte d'un client.
 */
exports.creer = asyncHandler(async (req, res) => {
  const { userId, adresseId, note, methode, items, dateLivraisonSouhaitee } = req.body;
  const result = await GestionCommandeService.creerCommandeAdmin(req.user.id, {
    userId,
    adresseId,
    note,
    methode,
    items,
    dateLivraisonSouhaitee: dateLivraisonSouhaitee || null,
  });
  if (!result.success) {
    if (result.status === 404) throw new NotFoundError(result.message);
    throw new BadRequestError(result.message);
  }
  return created(res, { commande: result.commande }, result.message);
});
