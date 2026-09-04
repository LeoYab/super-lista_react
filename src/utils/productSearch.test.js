import { textMatchesAllWords, filterProductsByTerm } from './productSearch';

describe('textMatchesAllWords', () => {
  test('matches when every word in the term appears somewhere in the text', () => {
    expect(textMatchesAllWords('Leche Entera La Serenisima', 'leche serenisima')).toBe(true);
  });

  test('does not match when a word is missing', () => {
    expect(textMatchesAllWords('Leche Entera La Serenisima', 'leche manteca')).toBe(false);
  });

  test('is case-insensitive', () => {
    expect(textMatchesAllWords('COCA COLA 2.25L', 'coca cola')).toBe(true);
  });

  test('returns false for an empty or blank term', () => {
    expect(textMatchesAllWords('Coca Cola', '')).toBe(false);
    expect(textMatchesAllWords('Coca Cola', '   ')).toBe(false);
  });
});

describe('filterProductsByTerm', () => {
  const products = [
    { nombre: 'Leche Entera', marca_producto: 'La Serenisima', id: '111' },
    { nombre: 'Coca Cola 2.25L', marca_producto: 'Coca-Cola', id: '222' },
  ];

  test('returns [] when the term is blank', () => {
    expect(filterProductsByTerm(products, '')).toEqual([]);
  });

  test('matches across the given fields', () => {
    expect(filterProductsByTerm(products, 'serenisima')).toEqual([products[0]]);
  });

  test('matches an EAN-like field when included', () => {
    expect(filterProductsByTerm(products, '222', ['nombre', 'marca_producto', 'id'])).toEqual([products[1]]);
  });

  test('requires all words to match', () => {
    expect(filterProductsByTerm(products, 'leche cola')).toEqual([]);
  });
});
