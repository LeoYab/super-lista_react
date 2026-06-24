/**
 * updateCategories.js
 * Script para leer y actualizar las categorías en Firebase Realtime Database.
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://superlista-ac191-default-rtdb.firebaseio.com'
});

const db = admin.database();

async function main() {
  const categoriesRef = db.ref('Categories');

  console.log('Leyendo categorías actuales de Firebase...\n');
  const snapshot = await categoriesRef.once('value');
  const rawData = snapshot.val();

  if (!rawData) {
    console.log('No se encontraron categorías en la base de datos.');
    process.exit(0);
  }

  const categories = Object.values(rawData);
  console.log('=== CATEGORÍAS ACTUALES ===');
  categories.forEach((cat, i) => {
    console.log(`[${i}] ID: ${cat.id} | order: ${cat.order ?? 'N/A'} | title: "${cat.title}" | icon: ${cat.icon}`);
  });

  console.log('\n=== PROCESANDO CAMBIOS ===\n');

  let updated = categories.map(cat => ({ ...cat }));

  // Renombrar Panadería → Harinas
  const panaderiaIdx = updated.findIndex(c => c.title.toLowerCase().includes('panader'));
  if (panaderiaIdx !== -1) {
    console.log(`✔ Renombrando "${updated[panaderiaIdx].title}" → "Harinas"`);
    updated[panaderiaIdx].title = 'Harinas';
    updated[panaderiaIdx].icon = '🌾';
    if (updated[panaderiaIdx].icons) updated[panaderiaIdx].icons = ['🌾', '🍞', '🥐'];
  } else {
    console.log('⚠ No se encontró categoría "Panadería" para renombrar.');
  }

  const maxId = Math.max(...updated.map(c => Number(c.id) || 0));
  let nextId = maxId + 1;

  // Nueva categoría: Galletitas
  const galletitasExists = updated.find(c => c.title.toLowerCase().includes('galletita'));
  if (!galletitasExists) {
    console.log(`✔ Creando nueva categoría "Galletitas" (id: ${nextId})`);
    updated.push({ id: nextId, title: 'Galletitas', icon: '🍪', icons: ['🍪', '🥮'] });
    nextId++;
  }

  // Nueva categoría: Snacks
  const snacksExists = updated.find(c => c.title.toLowerCase().includes('snack'));
  if (!snacksExists) {
    console.log(`✔ Creando nueva categoría "Snacks" (id: ${nextId})`);
    updated.push({ id: nextId, title: 'Snacks', icon: '🍿', icons: ['🍿', '🥜', '🍡'] });
    nextId++;
  }

  // Detectar categorías clave
  const otros = updated.find(c => c.title.toLowerCase() === 'otros');
  const almacen = updated.find(c => c.title.toLowerCase().includes('almac'));
  const perfumeria = updated.find(c => c.title.toLowerCase().includes('perfumer'));

  console.log('\nCategorías clave:');
  console.log('  Otros:', otros ? `"${otros.title}" (id: ${otros.id})` : 'NO ENCONTRADO');
  console.log('  Almacén:', almacen ? `"${almacen.title}" (id: ${almacen.id})` : 'NO ENCONTRADO');
  console.log('  Perfumería:', perfumeria ? `"${perfumeria.title}" (id: ${perfumeria.id})` : 'NO ENCONTRADO');

  // Separar especiales para reordenar
  const specialIds = new Set([otros?.id, almacen?.id, perfumeria?.id].filter(Boolean));
  const base = updated.filter(c => !specialIds.has(c.id));

  // Insertar Perfumería junto a Cuidado/Farmacia
  let finalOrder = [];
  for (const cat of base) {
    finalOrder.push(cat);
    if (perfumeria && (cat.title.toLowerCase().includes('cuidado') || cat.title.toLowerCase().includes('farmacia'))) {
      finalOrder.push(perfumeria);
      console.log(`✔ Perfumería insertada luego de "${cat.title}"`);
    }
  }

  // Si no se insertó Perfumería
  if (perfumeria && !finalOrder.find(c => c.id === perfumeria.id)) {
    console.log('⚠ No se encontró Cuidado/Farmacia, Perfumería se agrega al bloque principal.');
    finalOrder.push(perfumeria);
  }

  // Al final: Otros → Almacén
  if (otros) finalOrder.push(otros);
  if (almacen) finalOrder.push(almacen);

  // Asignar order
  finalOrder = finalOrder.map((cat, idx) => ({ ...cat, order: idx + 1 }));

  console.log('\n=== ORDEN FINAL ===');
  finalOrder.forEach(cat => {
    console.log(`[${cat.order}] ID: ${cat.id} | "${cat.title}" ${cat.icon}`);
  });

  // Guardar en Firebase
  console.log('\n⚡ Guardando en Firebase...');
  const categoriesObject = {};
  finalOrder.forEach(cat => {
    categoriesObject[cat.id] = cat;
  });

  await categoriesRef.set(categoriesObject);
  console.log('\n✅ Categorías actualizadas correctamente.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
