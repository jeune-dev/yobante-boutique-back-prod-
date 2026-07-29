/**
 * ✅ REFACTORING: Result Handler Middleware
 * Élimine 109 instances du pattern de gestion d'erreurs dupliqué:
 *
 * AVANT (9 lignes par controller):
 * try {
 *   const data = await service.method();
 *   return res.status(200).json({ success: true, data });
 * } catch (err) {
 *   return res.status(err.statusCode || 500).json({
 *     success: false,
 *     error: err.message
 *   });
 * }
 *
 * APRÈS (1 ligne par controller):
 * await resultHandler(res, service.method());
 */

class ResultHandler {
  /**
   * Gère une promise: succès → 200 + data, erreur → status + message
   * ✅ Simplifie tous les try/catch dans les controllers
   */
  static async handle(res, promise, statusCode = 200) {
    try {
      const data = await promise;
      return res.status(statusCode).json({
        success: true,
        data,
      });
    } catch (err) {
      const status = err.statusCode || 500;
      return res.status(status).json({
        success: false,
        error: err.message || 'Erreur serveur',
      });
    }
  }

  /**
   * Variante pour les mutations (DELETE, CREATE) avec message custom
   */
  static async handleMutation(res, promise, message = 'Opération réussie', statusCode = 200) {
    try {
      await promise;
      return res.status(statusCode).json({
        success: true,
        message,
      });
    } catch (err) {
      const status = err.statusCode || 500;
      return res.status(status).json({
        success: false,
        error: err.message || 'Erreur serveur',
      });
    }
  }

  /**
   * Variante pour les listes avec pagination
   */
  static async handlePaginated(res, promise, total = 0) {
    try {
      const data = await promise;
      return res.status(200).json({
        success: true,
        data,
        total: total || data?.length || 0,
      });
    } catch (err) {
      const status = err.statusCode || 500;
      return res.status(status).json({
        success: false,
        error: err.message || 'Erreur serveur',
      });
    }
  }
}

module.exports = ResultHandler;
