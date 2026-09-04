/**
 * rebuildCategories.js
 * Wipes /Categories entirely and rebuilds it from scratch using ONLY the
 * real top-level categories of Carrefour and ChangoMas (see
 * src/utils/categoryMapping.js), plus a single universal "Otros". Every
 * existing product referencing one of the old category ids is remapped to
 * its new equivalent first, so nothing ends up pointing at a deleted
 * category.
 *
 * Uso:
 *   node scripts/rebuildCategories.js           -> dry run (no escribe nada)
 *   node scripts/rebuildCategories.js --apply    -> aplica los cambios
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const serviceAccount = require('./serviceAccountKey.json');

const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: 'https://superlista-ac191-default-rtdb.firebaseio.com',
});

const db = getDatabase(app);
const APPLY = process.argv.includes('--apply');

// Mirrors src/utils/categoryMapping.js's ALL_CATEGORIES exactly.
const OTROS = { id: 0, title: 'Otros', icon: '🛍️', brand: 'general' };

const CARREFOUR = [
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
].map((c) => ({ ...c, brand: 'carrefour' }));

const CHANGOMAS = [
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
].map((c) => ({ ...c, brand: 'changomas' }));

const NEW_CATEGORIES = [OTROS, ...CARREFOUR, ...CHANGOMAS];

// Explicit, hand-verified mapping from each of the 18 categories currently
// live in Firebase to its new equivalent. Deterministic on purpose — this
// migration only runs once against a known, just-inspected data set, so a
// fixed table is safer than re-deriving it live via keyword matching.
const OLD_TO_NEW = {
  0: 0,     // Otros -> Otros
  8: 100,   // Almacén -> Almacén (Carrefour)
  1: 103,   // Lácteos y frescos -> Lácteos y productos frescos
  2: 100,   // Harinas -> Almacén
  12: 100,  // Galletitas -> Almacén
  13: 100,  // Snacks -> Almacén
  3: 102,   // Bebidas -> Bebidas
  4: 109,   // Cuidado y farmacia -> Perfumería y farmacia
  9: 109,   // Perfumería -> Perfumería y farmacia
  5: 108,   // Limpieza -> Limpieza
  6: 104,   // Carnes y pescados -> Carnes y Pescados
  7: 105,   // Futas y verduras -> Frutas y Verduras
  10: 106,  // Congelados -> Congelados
  11: 113,  // Juguetería y librería -> Juguetería y Librería
  14: 101,  // Desayuno y merienda -> Desayuno y merienda
  17: 112,  // Mascotas -> Mascotas
  24: 110,  // Mundo bebé -> Mundo bebé
  25: 109,  // Perfumería y farmacia (bug) -> Perfumería y farmacia
};

async function main() {
  const catSnap = await db.ref('Categories').once('value');
  const currentCategories = catSnap.val() || {};
  const currentIds = Object.keys(currentCategories).map(Number).sort((a, b) => a - b);
  const expectedIds = Object.keys(OLD_TO_NEW).map(Number).sort((a, b) => a - b);

  console.log(`=== Categorías actuales: ${currentIds.length} (ids: ${currentIds.join(', ')}) ===`);

  const unexpected = currentIds.filter((id) => !expectedIds.includes(id));
  if (unexpected.length > 0) {
    console.error(`\n❌ Hay categorías en Firebase que no están en la tabla de migración: ${unexpected.join(', ')}`);
    unexpected.forEach((id) => console.error(`   id:${id} "${currentCategories[id].title}"`));
    console.error('Abortando para no perder referencias. Agregá estos ids a OLD_TO_NEW y volvé a correr.');
    process.exit(1);
  }

  const usersSnap = await db.ref('Users').once('value');
  const users = usersSnap.val() || {};

  let productsScanned = 0;
  const updates = {};
  const reassignLog = [];
  const newById = Object.fromEntries(NEW_CATEGORIES.map((c) => [c.id, c]));

  for (const [uid, userData] of Object.entries(users)) {
    const lists = (userData && userData.User_Lists) || {};
    for (const [listId, listData] of Object.entries(lists)) {
      const products = (listData && listData.products) || {};
      for (const [productId, product] of Object.entries(products)) {
        productsScanned++;
        const oldCatId = Number(product.category);
        const newCatId = OLD_TO_NEW.hasOwnProperty(oldCatId) ? OLD_TO_NEW[oldCatId] : 0; // huérfano -> Otros
        const newCat = newById[newCatId];
        if (newCatId !== oldCatId) {
          const path = `Users/${uid}/User_Lists/${listId}/products/${productId}`;
          updates[`${path}/category`] = newCatId;
          updates[`${path}/icon`] = newCat.icon;
          reassignLog.push(`  ${product.nameProd || '(sin nombre)'} : ${oldCatId} "${currentCategories[oldCatId]?.title || '?'}" -> ${newCatId} "${newCat.title}"`);
        }
      }
    }
  }

  console.log(`\n=== Productos escaneados: ${productsScanned} ===`);
  console.log(`=== Productos a reasignar: ${reassignLog.length} ===`);
  reassignLog.forEach((l) => console.log(l));

  console.log(`\n=== Categorías nuevas a escribir: ${NEW_CATEGORIES.length} ===`);
  NEW_CATEGORIES.forEach((c) => console.log(`  id:${c.id} [${c.brand}] "${c.title}" ${c.icon}`));

  if (!APPLY) {
    console.log('\n(dry run — no se escribió nada. Volvé a correr con --apply para aplicar los cambios)');
    process.exit(0);
  }

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
    console.log(`\n✔ ${reassignLog.length} productos reasignados.`);
  }

  const categoriesObject = {};
  NEW_CATEGORIES.forEach((c, idx) => {
    categoriesObject[c.id] = { ...c, order: idx + 1 };
  });
  await db.ref('Categories').set(categoriesObject);
  console.log(`✔ Categories reconstruido: ${NEW_CATEGORIES.length} categorías (antes: ${currentIds.length}).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
