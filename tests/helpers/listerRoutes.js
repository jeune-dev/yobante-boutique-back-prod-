/**
 * Liste toutes les routes montées sur l'application Express 4 :
 * [{ methode: 'get', chemin: '/api/v1/admin/produits/:id' }, …]
 *
 * Parcourt la pile de routeurs (app._router.stack) et reconstruit le chemin
 * de montage à partir de l'expression régulière de chaque couche. Sert aux
 * tests « toutes les API » : une route ajoutée est testée sans rien déclarer.
 */
function segmentMontage(layer) {
  if (layer.regexp.fast_slash) return '';
  const source = layer.regexp
    .toString()
    .replace('\\/?', '')
    .replace('(?=\\/|$)', '$')
    .match(/^\/\^((?:\\[.*+?^${}()|[\]\\/]|[^.*+?^${}()|[\]\\/])*)\$\//);
  return source ? source[1].replace(/\\(.)/g, '$1') : null;
}

function parcourir(stack, prefixe, routes) {
  for (const layer of stack) {
    if (layer.route) {
      const methodes = Object.keys(layer.route.methods).filter((m) => m !== '_all');
      const chemins = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const chemin of chemins) {
        for (const methode of methodes) routes.push({ methode, chemin: `${prefixe}${chemin}` });
      }
    } else if (layer.name === 'router' && layer.handle.stack) {
      const segment = segmentMontage(layer);
      if (segment === null) continue; // montage par expression complexe : ignoré
      parcourir(layer.handle.stack, `${prefixe}${segment}`, routes);
    }
  }
}

function listerRoutes(app) {
  const routes = [];
  parcourir(app._router.stack, '', routes);
  const vues = new Set();
  return routes
    .map((r) => ({ ...r, chemin: r.chemin.replace(/\/+/g, '/').replace(/(.)\/$/, '$1') }))
    .filter((r) => {
      const cle = `${r.methode} ${r.chemin}`;
      if (vues.has(cle)) return false;
      vues.add(cle);
      return true;
    });
}

module.exports = { listerRoutes };
