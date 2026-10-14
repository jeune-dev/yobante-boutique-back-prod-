const { calculerPrixEffectif, prixEffectifs } = require('../../src/utils/prixEffectif');

describe('prixEffectif', () => {
  test('sans promotion : prix catalogue', () => {
    expect(calculerPrixEffectif({ prix: '1000.00', prixPromo: null })).toBe(1000);
  });

  test('prix promo du produit appliqué s’il est inférieur', () => {
    expect(calculerPrixEffectif({ prix: '1000.00', prixPromo: '850.00' })).toBe(850);
    expect(calculerPrixEffectif({ prix: '1000.00', prixPromo: '1200.00' })).toBe(1000);
    expect(calculerPrixEffectif({ prix: '1000.00', prixPromo: '0.00' })).toBe(1000);
  });

  test('promotion en cours : le prix le plus bas l’emporte', () => {
    expect(calculerPrixEffectif({ prix: 1000, prixPromo: 900 }, ['800.00'])).toBe(800);
    expect(calculerPrixEffectif({ prix: 1000, prixPromo: 700 }, ['800.00'])).toBe(700);
    expect(calculerPrixEffectif({ prix: 1000 }, [null, '0'])).toBe(1000);
  });

  test('prixEffectifs interroge les promotions en cours des produits', async () => {
    const Promotion = {
      findAll: jest.fn(async () => [{ produitId: 'a', prixPromo: '750.00' }]),
    };
    const prix = await prixEffectifs(Promotion, [
      { id: 'a', prix: '1000.00', prixPromo: null },
      { id: 'b', prix: '500.00', prixPromo: '450.00' },
    ]);
    expect(prix.get('a')).toBe(750);
    expect(prix.get('b')).toBe(450);
    expect(Promotion.findAll).toHaveBeenCalledTimes(1);
  });
});
