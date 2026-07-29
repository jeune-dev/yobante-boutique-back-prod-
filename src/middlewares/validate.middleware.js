// ─────────────────────────────────────────────────────────────
// middlewares/validate.middleware.js — Validation Joi centralisée
// Propage les erreurs au Global Error Handler via next(err)
// pour garantir un format de réponse uniforme.
// ✅ PERF: Optimisation conversion (peut être désactivée si pas nécessaire)
// ─────────────────────────────────────────────────────────────
const validate =
  (schema, source = 'body', options = {}) =>
  (req, res, next) => {
    // ✅ PERF: Désactiver convert() si pas nécessaire pour économiser du CPU
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: options.convert !== false, // Défaut: true, mais peut être override
    });

    if (error) return next(error);

    req[source] = value;
    next();
  };

module.exports = validate;
