// src/utils/categoryMapping.js
//
// Curated, per-supermarket category taxonomies and the mapping logic used
// to resolve a scanned product's raw VTEX category path (e.g.
// "Almacén/Aceites, vinagres y aderezos/") into one of a FIXED set of main
// categories — mirroring each retailer's own top-level site navigation —
// instead of inventing a new one-off category per subcategory.
//
// Firebase's `Categories` node mirrors these arrays exactly (id, title,
// icon, brand) — see scripts/rebuildCategories.js. Each category is tagged
// with the brand it belongs to ('carrefour' | 'changomas' | 'general' for
// the single universal "Otros"). Carrefour's and ChangoMas's real category
// names are genuinely different strings (e.g. "Perfumería y farmacia" vs
// "Perfumería"), so they are kept as fully separate sets rather than
// reconciled into one shared list — mixing them was exactly what caused
// resolveProductCategory to keep spawning new one-off categories.
//
// IDs are namespaced by range so the full list never collides:
// general (Otros only) = 0, carrefour = 100-199, changomas = 200-299.

export const CATEGORY_BRANDS = {
  GENERAL: 'general',
  CARREFOUR: 'carrefour',
  CHANGOMAS: 'changomas',
};

// The only brands with a real, mapped taxonomy. A scan from any other
// brand (Día, Jumbo, Vea, Easy, ...) is never mapped — it always lands in
// "Otros" for the user to recategorize by hand.
export const MAPPED_BRANDS = [CATEGORY_BRANDS.CARREFOUR, CATEGORY_BRANDS.CHANGOMAS];

// Single universal fallback category, shared by every brand context.
export const OTROS_CATEGORY = { id: 0, title: 'Otros', icon: '🛍️', brand: CATEGORY_BRANDS.GENERAL };

// Real top-level categories from carrefour.com.ar's own mega menu
// (carrefourar-mega-menu-0-x-menuContainerVertical), minus "Ofertas" and
// "Destacados" which aren't product categories.
export const CARREFOUR_CATEGORIES = [
  { id: 100, title: 'Almacén', icon: '🏪' },
  { id: 101, title: 'Desayuno y merienda', icon: '☕' },
  { id: 102, title: 'Bebidas', icon: '🥤' },
  { id: 103, title: 'Lácteos y productos frescos', icon: '🍶' },
  { id: 104, title: 'Carnes y Pescados', icon: '🥩' },
  { id: 105, title: 'Frutas y Verduras', icon: '🥕' },
  { id: 106, title: 'Congelados', icon: '❄️' },
  { id: 107, title: 'Panadería', icon: '🥖' },
  { id: 108, title: 'Limpieza', icon: '🧹' },
  { id: 109, title: 'Perfumería y farmacia', icon: '🧴' },
  { id: 110, title: 'Mundo bebé', icon: '🍼' },
  { id: 111, title: 'Indumentaria', icon: '👕' },
  { id: 112, title: 'Mascotas', icon: '🐶' },
  { id: 113, title: 'Juguetería y Librería', icon: '🛝' },
  { id: 114, title: 'Automotor', icon: '🚗' },
  { id: 115, title: 'Aire Libre y Ocio', icon: '⛺' },
  { id: 116, title: 'Hogar', icon: '🏠' },
  { id: 117, title: 'Electro y tecnología', icon: '📱' },
].map((c) => ({ ...c, brand: CATEGORY_BRANDS.CARREFOUR }));

// Real top-level categories from masonline.com.ar's own mega menu
// (valtech-gdn-new-seller-menu-0-x-menuContainerVertical).
export const CHANGOMAS_CATEGORIES = [
  { id: 200, title: 'Almacén', icon: '🏪' },
  { id: 201, title: 'Carnicería, Pescadería y Verdulería', icon: '🥩' },
  { id: 202, title: 'Frescos y Congelados', icon: '🍶' },
  { id: 203, title: 'Bebidas', icon: '🥤' },
  { id: 204, title: 'Perfumería', icon: '🧴' },
  { id: 205, title: 'Belleza', icon: '💄' },
  { id: 206, title: 'Limpieza', icon: '🧹' },
  { id: 207, title: 'Bebés y Niños', icon: '🍼' },
  { id: 208, title: 'Mascotas', icon: '🐶' },
  { id: 209, title: 'Hogar', icon: '🏠' },
  { id: 210, title: 'Electrodomésticos', icon: '🔌' },
  { id: 211, title: 'Tecnología', icon: '📱' },
  { id: 212, title: 'Deportes, Ocio y Aire Libre', icon: '⚽' },
  { id: 213, title: 'Automotor', icon: '🚗' },
  { id: 214, title: 'Indumentaria, Calzado y Marroquinería', icon: '👕' },
].map((c) => ({ ...c, brand: CATEGORY_BRANDS.CHANGOMAS }));

export const CATEGORY_SETS = {
  [CATEGORY_BRANDS.GENERAL]: [OTROS_CATEGORY],
  [CATEGORY_BRANDS.CARREFOUR]: CARREFOUR_CATEGORIES,
  [CATEGORY_BRANDS.CHANGOMAS]: CHANGOMAS_CATEGORIES,
};

// The full category universe, exactly as it should exist in Firebase.
export const ALL_CATEGORIES = [OTROS_CATEGORY, ...CARREFOUR_CATEGORIES, ...CHANGOMAS_CATEGORIES];

const normalize = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, ''); // strip accents

/**
 * Finds the category whose title best matches `title` in `set`, comparing
 * normalized (lowercase, accent-stripped) strings so minor wording
 * differences ("Carnes y Pescados" vs "carnes y pescados") still match.
 */
const findByTitle = (set, title) => set.find((c) => normalize(c.title) === normalize(title));

/**
 * Builds a raw-path -> curated-title matcher. `rules` is an ordered list of
 * [title, keywords[]] pairs; the first rule whose keyword appears in the
 * root segment OR the full path wins. Order matters — more specific rules
 * (e.g. "Galletitas") must come before broader ones (e.g. "Almacén").
 */
const buildMatcher = (set, rules) => (categoriesList) => {
  if (!categoriesList || categoriesList.length === 0) return OTROS_CATEGORY;

  const path = categoriesList[0];
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return OTROS_CATEGORY;

  const root = normalize(parts[0]);
  const fullPath = normalize(path);

  // 1. Direct match: the scanned root segment already IS one of the
  // curated main category names (this is the common case, since VTEX's
  // category breadcrumb mirrors the site's own top-level nav).
  const direct = findByTitle(set, parts[0]);
  if (direct) return direct;

  // 2. Keyword rules for subcategories that don't literally repeat the
  // main category's name (e.g. "Aceites, vinagres y aderezos" -> Almacén).
  for (const [title, keywords] of rules) {
    if (keywords.some((kw) => root.includes(kw) || fullPath.includes(kw))) {
      const match = findByTitle(set, title);
      if (match) return match;
    }
  }

  // 3. Never invent a new category — fall back to "Otros".
  return OTROS_CATEGORY;
};

export const mapToCarrefourCategory = buildMatcher(CARREFOUR_CATEGORIES, [
  ['Panadería', ['panader', 'factura', 'reposteria', 'panificado']],
  ['Desayuno y merienda', ['desayuno', 'merienda', 'te ', 'cafe', 'café', 'infusion', 'edulcorante', 'mermelada', 'miel']],
  ['Congelados', ['congelado']],
  ['Limpieza', ['limpieza', 'lavandina', 'detergente', 'lavado de ropa', 'insecticida', 'repelente', 'papel higienico', 'papeles', 'bolsas', 'film', 'rollo de cocina', 'pisos', 'muebles']],
  ['Perfumería y farmacia', ['perfumer', 'farmacia', 'cuidado personal', 'higiene', 'cosmet', 'cuidado del cabello', 'cuidado oral', 'shampoo', 'crema dental', 'medicamento']],
  ['Mundo bebé', ['bebe', 'bebé', 'pañal', 'lactancia', 'maternidad']],
  ['Bebidas', ['bebida', 'gaseosa', 'jugo', 'agua', 'alcohol', 'cerveza', 'vino', 'licor', 'fernet']],
  ['Lácteos y productos frescos', ['lacteo', 'lácteo', 'queso', 'manteca', 'yogur', 'leche', 'crema de leche']],
  ['Carnes y Pescados', ['carne', 'pollo', 'pescado', 'vacuno', 'cerdo', 'fiambr', 'embutido', 'mariscos']],
  ['Frutas y Verduras', ['fruta', 'verdur', 'huerta']],
  ['Mascotas', ['mascota', 'perro', 'gato']],
  ['Indumentaria', ['ropa', 'indumentaria', 'calzado', 'zapatilla']],
  ['Juguetería y Librería', ['juguet', 'libreria', 'librería', 'utiles escolares']],
  ['Automotor', ['automotor', 'auto ', 'vehiculo']],
  ['Aire Libre y Ocio', ['aire libre', 'jardin', 'jardín', 'camping', 'pileta']],
  ['Hogar', ['hogar', 'bazar', 'decoracion', 'iluminacion', 'textil']],
  ['Electro y tecnología', ['electro', 'tecnolog', 'celular', 'informatica', 'electronica']],
  ['Almacén', [
    'almacen', 'almacén', 'galletita', 'galleta', 'snack', 'copet', 'papa frita',
    'aceite', 'vinagre', 'aderezo', 'conserva', 'enlatado', 'arroz', 'legumbre',
    'pasta', 'fideo', 'condimento', 'especia', 'caldo', 'sopa', 'pure', 'puré',
    'kiosco', 'golosina', 'chocolate', 'harina', 'azucar', 'azúcar', 'sal ',
  ]],
]);

export const mapToChangoMasCategory = buildMatcher(CHANGOMAS_CATEGORIES, [
  ['Frescos y Congelados', ['congelado', 'lacteo', 'lácteo', 'queso', 'manteca', 'yogur', 'leche', 'fiambr', 'embutido']],
  ['Carnicería, Pescadería y Verdulería', ['carne', 'pollo', 'pescado', 'vacuno', 'cerdo', 'mariscos', 'fruta', 'verdur', 'huerta']],
  ['Limpieza', ['limpieza', 'lavandina', 'detergente', 'lavado de ropa', 'insecticida', 'repelente', 'papel higienico', 'papeles', 'bolsas', 'film', 'rollo de cocina', 'pisos', 'muebles']],
  ['Perfumería', ['perfumer', 'cuidado personal', 'higiene', 'cuidado del cabello', 'cuidado oral', 'shampoo', 'crema dental', 'desodorante']],
  ['Belleza', ['belleza', 'cosmet', 'maquillaje']],
  ['Bebés y Niños', ['bebe', 'bebé', 'pañal', 'lactancia', 'maternidad', 'ninos', 'niños']],
  ['Bebidas', ['bebida', 'gaseosa', 'jugo', 'agua', 'alcohol', 'cerveza', 'vino', 'licor', 'fernet']],
  ['Mascotas', ['mascota', 'perro', 'gato']],
  ['Electrodomésticos', ['electrodomestico', 'electrodoméstico', 'linea blanca']],
  ['Tecnología', ['tecnolog', 'celular', 'informatica', 'electronica']],
  ['Deportes, Ocio y Aire Libre', ['deporte', 'aire libre', 'jardin', 'jardín', 'camping', 'pileta']],
  ['Automotor', ['automotor', 'auto ', 'vehiculo']],
  ['Indumentaria, Calzado y Marroquinería', ['ropa', 'indumentaria', 'calzado', 'zapatilla', 'marroquineria']],
  ['Hogar', ['hogar', 'bazar', 'decoracion', 'iluminacion', 'textil', 'juguet', 'libreria', 'librería']],
  ['Almacén', [
    'almacen', 'almacén', 'galletita', 'galleta', 'snack', 'copet', 'papa frita',
    'aceite', 'vinagre', 'aderezo', 'conserva', 'enlatado', 'arroz', 'legumbre',
    'pasta', 'fideo', 'condimento', 'especia', 'caldo', 'sopa', 'pure', 'puré',
    'kiosco', 'golosina', 'chocolate', 'harina', 'azucar', 'azúcar', 'sal ',
    'panader', 'desayuno', 'merienda', 'te ', 'cafe', 'café', 'infusion', 'mermelada', 'miel',
  ]],
]);

/**
 * Picks the right mapper for a mapped brand. Returns null for a brand that
 * has no curated taxonomy (Día, Jumbo, Vea, Easy, ...) — callers must treat
 * that as "don't map, use Otros directly".
 */
export const getCategoryMapperForBrand = (brandKey) => {
  if (brandKey === CATEGORY_BRANDS.CARREFOUR) return mapToCarrefourCategory;
  if (brandKey === CATEGORY_BRANDS.CHANGOMAS) return mapToChangoMasCategory;
  return null;
};

/**
 * The curated category set to show as filter chips / picker options for a
 * given brand context (GPS-detected supermarket, or the brand explicitly
 * selected on the Supermercados screen): "Otros" plus that brand's own main
 * categories. Falls back to just "Otros" for a brand with no taxonomy.
 */
export const getCategorySetForBrand = (brandKey) => [OTROS_CATEGORY, ...(CATEGORY_SETS[brandKey] || [])];

/**
 * Resolves a scanned product's raw category path to a category the
 * product can actually reference in Firebase.
 *
 * - Carrefour/ChangoMas: maps the path to one of that brand's curated
 *   main-category titles, then finds it in `currentCategories` (the live
 *   Firebase Categories list, which mirrors ALL_CATEGORIES) by title. Since
 *   Firebase already holds every curated title, this should always find a
 *   match; `addCategoryFn` is kept only as a last-resort safety net.
 * - Any other brand (or no brand detected): never attempted — always
 *   "Otros", for the user to recategorize by hand. This is deliberate:
 *   guessing from an unmapped retailer's own category names is exactly
 *   what used to spawn a new one-off category per scan.
 */
export const resolveProductCategory = async (categoriesList, currentCategories, brandKey, addCategoryFn) => {
  const otros = currentCategories.find((c) => normalize(c.title) === 'otros') || currentCategories[0] || OTROS_CATEGORY;

  const mapper = getCategoryMapperForBrand(brandKey);
  if (!mapper) return otros;

  const targetCategoryInfo = mapper(categoriesList);

  let foundCategory = currentCategories.find(
    (cat) => normalize(cat.title) === normalize(targetCategoryInfo.title)
  );

  if (!foundCategory) {
    console.log(`Categoría no encontrada: "${targetCategoryInfo.title}". Agregándola...`);
    try {
      foundCategory = await addCategoryFn({ ...targetCategoryInfo, brand: brandKey });
    } catch (err) {
      console.error('Error al agregar categoría dinámicamente:', err);
      foundCategory = otros;
    }
  }

  return foundCategory;
};
