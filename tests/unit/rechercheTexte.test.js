const {
  motsRecherche,
  pertinence,
  correspond,
  chercherProduits,
} = require('../../src/utils/rechercheTexte');

const produit = (nom, extra = {}) => ({ nom, description: '', ...extra });

describe('rechercheTexte — découpage', () => {
  test('ignore les petits mots, la casse et les accents', () => {
    expect(motsRecherche('Chaussures de Sport')).toEqual(['chaussures', 'sport']);
    expect(motsRecherche('Télévision')).toEqual(['television']);
    expect(motsRecherche('%%')).toEqual([]);
  });
});

describe('rechercheTexte — tolérance', () => {
  const tele = produit('LP Téléviseur 50 Pouces Smart Android 4K UHD');
  const teleVision = produit('Télévision Samsung 43"');

  test('sans accents', () => {
    expect(correspond(teleVision, 'television')).toBe(true);
    expect(correspond(teleVision, 'TELEVISION')).toBe(true);
    expect(correspond(produit('Téléphone Samsung A15'), 'telephone')).toBe(true);
  });

  test('variantes d’un même mot', () => {
    expect(correspond(tele, 'television')).toBe(true);
    expect(correspond(teleVision, 'televiseur')).toBe(true);
    expect(correspond(produit('Chaussure de sport Nike'), 'chaussures nike')).toBe(true);
  });

  test('frappe en cours', () => {
    expect(correspond(tele, 'tele')).toBe(true);
    expect(correspond(produit('Chaussure de sport'), 'chau')).toBe(true);
  });

  test('fautes de frappe', () => {
    expect(correspond(teleVision, 'televsion')).toBe(true);
    expect(correspond(teleVision, 'telivision')).toBe(true);
    expect(correspond(produit('Ordinateur portable HP'), 'ordinatuer')).toBe(true);
    expect(correspond(produit('Réfrigérateur Samsung'), 'refrigerateu')).toBe(true);
    expect(correspond(teleVision, 'televs')).toBe(true);
  });

  test('dans la catégorie ou le rayon', () => {
    expect(correspond(produit('Smart 43" 4K', { categorie: { nom: 'Télévisions' } }), 'television')).toBe(true);
  });

  test("n'invente pas de résultat", () => {
    expect(correspond(produit('Sachet de thé'), 'sac')).toBe(false);
    expect(correspond(produit('Litre de lait'), 'lit')).toBe(false);
    expect(correspond(produit('Chaussure de sport'), 'zzqxw')).toBe(false);
    expect(correspond(produit('Chaussure Nike'), 'chaussure adidas')).toBe(false);
    expect(correspond(produit('Chaussette coton'), 'chaussure')).toBe(false);
    expect(correspond(produit('Téléphone Samsung'), 'television')).toBe(false);
    expect(correspond(produit('Sacs à main'), 'sac')).toBe(true);
  });

  test('le nom pèse plus que la description', () => {
    const dansNom = produit('Télévision 4K');
    const dansDescription = produit('Support mural', { description: 'Pour télévision jusqu’à 55 pouces' });
    expect(pertinence(dansNom, 'television')).toBeGreaterThan(pertinence(dansDescription, 'television'));
    expect(correspond(dansDescription, 'television')).toBe(true);
  });
});

describe('chercherProduits', () => {
  test('filtre, classe par pertinence et pagine', async () => {
    const lignes = [
      produit('Support mural', { description: 'pour television' }),
      produit('Téléviseur LED 32"'),
      produit('Sachet de thé'),
      produit('Télévision Samsung'),
    ];
    const Produit = { findAll: jest.fn(async () => lignes), findAndCountAll: jest.fn() };
    const { count, rows } = await chercherProduits(Produit, { requete: 'television', page: 1, limit: 2 });
    expect(count).toBe(3);
    expect(rows.map((p) => p.nom)).toEqual(['Télévision Samsung', 'Téléviseur LED 32"']);
  });

  test('sans recherche : liste simple', async () => {
    const Produit = { findAll: jest.fn(), findAndCountAll: jest.fn(async () => ({ count: 0, rows: [] })) };
    await chercherProduits(Produit, { requete: '', page: 1, limit: 20 });
    expect(Produit.findAndCountAll).toHaveBeenCalled();
    expect(Produit.findAll).not.toHaveBeenCalled();
  });
});
