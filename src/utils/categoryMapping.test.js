// src/utils/categoryMapping.test.js
//
// This is the most failure-prone piece of business logic in the app: it
// decides which category a scanned product lands in, and past bugs here
// (categories mixing between Carrefour/ChangoMas, one-off categories being
// spawned per scan) shipped silently because nothing tested it. See
// CLAUDE.md's "Categories" section for the intended behavior these tests
// pin down.

import {
  CATEGORY_BRANDS,
  OTROS_CATEGORY,
  CARREFOUR_CATEGORIES,
  CHANGOMAS_CATEGORIES,
  getCategorySetForBrand,
  mapToCarrefourCategory,
  mapToChangoMasCategory,
  resolveProductCategory,
} from './categoryMapping';

describe('getCategorySetForBrand', () => {
  test('returns Otros + the full Carrefour taxonomy for carrefour', () => {
    const set = getCategorySetForBrand(CATEGORY_BRANDS.CARREFOUR);
    expect(set[0]).toEqual(OTROS_CATEGORY);
    expect(set.slice(1)).toEqual(CARREFOUR_CATEGORIES);
  });

  test('returns Otros + the full ChangoMas taxonomy for changomas', () => {
    const set = getCategorySetForBrand(CATEGORY_BRANDS.CHANGOMAS);
    expect(set[0]).toEqual(OTROS_CATEGORY);
    expect(set.slice(1)).toEqual(CHANGOMAS_CATEGORIES);
  });

  test('returns just Otros for a brand with no curated taxonomy', () => {
    expect(getCategorySetForBrand('dia')).toEqual([OTROS_CATEGORY]);
    expect(getCategorySetForBrand(undefined)).toEqual([OTROS_CATEGORY]);
  });

  test('never mixes Carrefour and ChangoMas titles in the same set', () => {
    const carrefourTitles = getCategorySetForBrand(CATEGORY_BRANDS.CARREFOUR).map((c) => c.title);
    const changomasOnlyTitles = CHANGOMAS_CATEGORIES.map((c) => c.title).filter(
      (title) => !CARREFOUR_CATEGORIES.some((c) => c.title === title)
    );
    changomasOnlyTitles.forEach((title) => {
      expect(carrefourTitles).not.toContain(title);
    });
  });
});

describe('mapToCarrefourCategory', () => {
  test('maps a root segment that already matches a curated title (direct match)', () => {
    expect(mapToCarrefourCategory(['Bebidas/Gaseosas/']).title).toBe('Bebidas');
  });

  test('maps a subcategory via keyword when the root name does not literally match', () => {
    expect(mapToCarrefourCategory(['Comidas Preparadas/Congelados/']).title).toBe('Congelados');
  });

  test('falls back to Otros for an empty or missing category path', () => {
    expect(mapToCarrefourCategory([])).toEqual(OTROS_CATEGORY);
    expect(mapToCarrefourCategory(undefined)).toEqual(OTROS_CATEGORY);
  });

  test('falls back to Otros for a path with no known keyword match', () => {
    expect(mapToCarrefourCategory(['Nada que ver con nada/'])).toEqual(OTROS_CATEGORY);
  });
});

describe('mapToChangoMasCategory', () => {
  test('maps a root segment that already matches a curated title (direct match)', () => {
    expect(mapToChangoMasCategory(['Perfumería/Shampoo/']).title).toBe('Perfumería');
  });

  test('maps a subcategory via keyword to the ChangoMas-specific grouping', () => {
    // ChangoMas groups fresh/frozen dairy together, unlike Carrefour which
    // splits it into separate main categories.
    expect(mapToChangoMasCategory(['Otros/Yogur bebible/']).title).toBe('Frescos y Congelados');
  });

  test('falls back to Otros for an empty category path', () => {
    expect(mapToChangoMasCategory([])).toEqual(OTROS_CATEGORY);
  });
});

describe('resolveProductCategory', () => {
  const currentCategories = [OTROS_CATEGORY, ...CARREFOUR_CATEGORIES, ...CHANGOMAS_CATEGORIES];

  test('unmapped brand always resolves to Otros without ever adding a category', async () => {
    const addCategoryFn = jest.fn();
    const result = await resolveProductCategory(['Cualquier/Cosa/'], currentCategories, 'dia', addCategoryFn);
    expect(result).toEqual(OTROS_CATEGORY);
    expect(addCategoryFn).not.toHaveBeenCalled();
  });

  test('no detected brand resolves to Otros without ever adding a category', async () => {
    const addCategoryFn = jest.fn();
    const result = await resolveProductCategory(['Bebidas/Gaseosas/'], currentCategories, null, addCategoryFn);
    expect(result).toEqual(OTROS_CATEGORY);
    expect(addCategoryFn).not.toHaveBeenCalled();
  });

  test('Carrefour scan resolves to the matching category already present in Firebase, without adding one', async () => {
    const addCategoryFn = jest.fn();
    const result = await resolveProductCategory(
      ['Bebidas/Gaseosas/'],
      currentCategories,
      CATEGORY_BRANDS.CARREFOUR,
      addCategoryFn
    );
    expect(result.title).toBe('Bebidas');
    expect(result.brand).toBe(CATEGORY_BRANDS.CARREFOUR);
    expect(addCategoryFn).not.toHaveBeenCalled();
  });

  test('calls addCategoryFn as a last-resort when the target category is missing from Firebase', async () => {
    const addedCategory = { id: 999, title: 'Bebidas', icon: '🥤', brand: CATEGORY_BRANDS.CARREFOUR };
    const addCategoryFn = jest.fn().mockResolvedValue(addedCategory);
    // currentCategories deliberately omits every Carrefour category.
    const sparseCategories = [OTROS_CATEGORY];

    const result = await resolveProductCategory(
      ['Bebidas/Gaseosas/'],
      sparseCategories,
      CATEGORY_BRANDS.CARREFOUR,
      addCategoryFn
    );

    expect(addCategoryFn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bebidas', brand: CATEGORY_BRANDS.CARREFOUR }));
    expect(result).toEqual(addedCategory);
  });

  test('falls back to Otros if addCategoryFn throws', async () => {
    const addCategoryFn = jest.fn().mockRejectedValue(new Error('network error'));
    const sparseCategories = [OTROS_CATEGORY];

    const result = await resolveProductCategory(
      ['Bebidas/Gaseosas/'],
      sparseCategories,
      CATEGORY_BRANDS.CARREFOUR,
      addCategoryFn
    );

    expect(result).toEqual(OTROS_CATEGORY);
  });
});
