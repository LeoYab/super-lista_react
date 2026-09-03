// src/utils/categoryMapping.js
//
// Curated, per-supermarket category taxonomies and the mapping logic used
// to resolve a scanned product's raw VTEX category path (e.g.
// "Almacén/Aceites, vinagres y aderezos/") into one of a FIXED set of main
// categories — mirroring each retailer's own top-level site navigation —
// instead of inventing a new one-off category per subcategory.
//
// IDs are namespaced by range so a merged list (general + carrefour +
// changomas) never collides: general 0-99, carrefour 100-199,
// changomas 200-299.
//
// Firebase's `Categories` node stays a single flat list (unchanged) — it's
// the store of categories a product can actually reference. The per-brand
// arrays below are never written to Firebase as-is; they only drive (a)
// which title/icon a scanned subcategory resolves to, via
// resolveProductCategory, which then finds-or-creates that title in the
// flat Firebase list, and (b) which chips a brand-scoped screen shows in
// its category filter/picker (see getCategorySetForBrand).

export const CATEGORY_BRANDS = {
  GENERAL: 'general',
  CARREFOUR: 'carrefour',
  CHANGOMAS: 'changomas',
};

// Baseline set for manually-added products and as a fallback when no
// supermarket context is available. Preserves the ids of the app's
// original hand-curated categories so existing products keep resolving.
export const GENERAL_CATEGORIES = [
  { id: 0, title: 'Otros', icon: '🛍️' },
  { id: 8, title: 'Almacén', icon: '🏪' },
  { id: 1, title: 'Lácteos y frescos', icon: '🍶' },
  { id: 2, title: 'Harinas', icon: '🌾' },
  { id: 12, title: 'Galletitas', icon: '🍪' },
  { id: 13, title: 'Snacks', icon: '🍿' },
  { id: 3, title: 'Bebidas', icon: '🥤' },
  { id: 4, title: 'Cuidado y farmacia', icon: '💅🏻' },
  { id: 9, title: 'Perfumería', icon: '🧴' },
  { id: 5, title: 'Limpieza', icon: '🧹' },
  { id: 6, title: 'Carnes y pescados', icon: '🥩' },
  { id: 7, title: 'Frutas y verduras', icon: '🥕' },
  { id: 10, title: 'Congelados', icon: '❄️' },
  { id: 11, title: 'Juguetería y librería', icon: '🛝' },
];

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
  { id: 118, title: 'Otros', icon: '🛍️' },
];

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
  { id: 215, title: 'Otros', icon: '🛍️' },
];

export const CATEGORY_SETS = {
  [CATEGORY_BRANDS.GENERAL]: GENERAL_CATEGORIES,
  [CATEGORY_BRANDS.CARREFOUR]: CARREFOUR_CATEGORIES,
  [CATEGORY_BRANDS.CHANGOMAS]: CHANGOMAS_CATEGORIES,
};

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

const findOtros = (set) => findByTitle(set, 'Otros') || set[set.length - 1];

/**
 * Builds a raw-path -> curated-title matcher. `rules` is an ordered list of
 * [title, keywords[]] pairs; the first rule whose keyword appears in the
 * root segment OR the full path wins. Order matters — more specific rules
 * (e.g. "Galletitas") must come before broader ones (e.g. "Almacén").
 */
const buildMatcher = (set, rules) => (categoriesList) => {
  if (!categoriesList || categoriesList.length === 0) return findOtros(set);

  const path = categoriesList[0];
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return findOtros(set);

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
  return findOtros(set);
};

export const mapToCarrefourCategory = buildMatcher(CARREFOUR_CATEGORIES, [
  ['Panadería', ['panader', 'factura', 'reposteria', 'reposteria', 'panificado']],
  ['Desayuno y merienda', ['desayuno', 'merienda', 'te ', 'cafe', 'café', 'infusion', 'edulcorante', 'mermelada', 'miel']],
  ['Congelados', ['congelado']],
  ['Limpieza', ['limpieza', 'lavandina', 'detergente', 'lavado de ropa', 'insecticida', 'repelente', 'papel higienico', 'papeles', 'bolsas', 'film', 'rollo de cocina']],
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
  ['Hogar', ['hogar', 'bazar', 'muebles', 'decoracion', 'iluminacion', 'textil']],
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
  ['Hogar', ['hogar', 'bazar', 'muebles', 'decoracion', 'iluminacion', 'textil', 'juguet', 'libreria', 'librería']],
  ['Almacén', [
    'almacen', 'almacén', 'galletita', 'galleta', 'snack', 'copet', 'papa frita',
    'aceite', 'vinagre', 'aderezo', 'conserva', 'enlatado', 'arroz', 'legumbre',
    'pasta', 'fideo', 'condimento', 'especia', 'caldo', 'sopa', 'pure', 'puré',
    'kiosco', 'golosina', 'chocolate', 'harina', 'azucar', 'azúcar', 'sal ',
    'panader', 'desayuno', 'merienda', 'te ', 'cafe', 'café', 'infusion', 'mermelada', 'miel',
  ]],
]);

/**
 * Picks the right mapper for a given brand key. Falls back to the
 * Carrefour mapper (the safest default keyword coverage) for brands
 * without a dedicated real taxonomy yet.
 */
export const getCategoryMapperForBrand = (brandKey) => {
  if (brandKey === CATEGORY_BRANDS.CHANGOMAS) return mapToChangoMasCategory;
  return mapToCarrefourCategory;
};

/**
 * The curated category set to show as filter chips / picker options for a
 * given brand context (GPS-detected supermarket, or the brand explicitly
 * selected on the Supermercados screen). Falls back to the general
 * baseline when there's no brand context yet.
 */
export const getCategorySetForBrand = (brandKey) => CATEGORY_SETS[brandKey] || GENERAL_CATEGORIES;

/**
 * Resolves a scanned product's raw category path to a category the
 * product can actually reference in Firebase: maps the path to one of the
 * curated main-category titles for `brandKey`, then finds that title in
 * `currentCategories` (the live flat Firebase Categories list) or, if it
 * doesn't exist yet, creates it there via `addCategory` — so subcategories
 * always land in a main category instead of spawning a new one-off entry.
 */
export const resolveProductCategory = async (categoriesList, currentCategories, brandKey, addCategoryFn) => {
  const mapper = getCategoryMapperForBrand(brandKey);
  const targetCategoryInfo = mapper(categoriesList);

  let foundCategory = currentCategories.find(
    (cat) => normalize(cat.title) === normalize(targetCategoryInfo.title)
  );

  if (!foundCategory) {
    console.log(`Categoría no encontrada: "${targetCategoryInfo.title}". Agregándola...`);
    try {
      foundCategory = await addCategoryFn(targetCategoryInfo);
    } catch (err) {
      console.error('Error al agregar categoría dinámicamente:', err);
      foundCategory = currentCategories.find((cat) => normalize(cat.title) === 'otros') || currentCategories[0];
    }
  }

  return foundCategory;
};
