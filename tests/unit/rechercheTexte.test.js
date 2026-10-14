const { motsRecherche, motifNom } = require('../../src/utils/rechercheTexte');

// Reproduit le test PostgreSQL `~*` (\m = début de mot, \M = fin de mot) en JS.
const versRegexJs = (p) => new RegExp(p.replace(/\\m/g, '(?<![\\p{L}\\p{N}])').replace(/\\M/g, '(?![\\p{L}\\p{N}])'), 'iu');
const trouveDansNom = (requete, nom) =>
  motsRecherche(requete).every((m) => versRegexJs(motifNom(m)).test(nom));

describe('rechercheTexte', () => {
  test('découpe la requête et ignore les petits mots', () => {
    expect(motsRecherche('Chaussures de Sport')).toEqual(['chaussures', 'sport']);
    expect(motsRecherche('%%')).toEqual([]);
  });

  test('trouve un produit pertinent', () => {
    expect(trouveDansNom('chaussure', 'Chaussure de sport Nike')).toBe(true);
    expect(trouveDansNom('chaussures nike', 'Chaussure de sport Nike')).toBe(true);
    expect(trouveDansNom('telephone', 'Téléphone Samsung A15')).toBe(true);
    expect(trouveDansNom('chau', 'Chaussure de sport')).toBe(true);
  });

  test("n'invente pas de résultat", () => {
    expect(trouveDansNom('sac', 'Sachet de thé')).toBe(false);
    expect(trouveDansNom('zzqxw', 'Chaussure de sport')).toBe(false);
    expect(trouveDansNom('chaussure adidas', 'Chaussure de sport Nike')).toBe(false);
    expect(trouveDansNom('robe', 'Garde-robe en bois')).toBe(true); // mot entier « robe »
    expect(trouveDansNom('robe', 'Microbes')).toBe(false);
    expect(trouveDansNom('lit', 'Litre de lait')).toBe(false);
    expect(trouveDansNom('sac', 'Sacs à main')).toBe(true);
  });
});
