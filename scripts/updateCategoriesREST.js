/**
 * updateCategoriesREST.js
 * Script para actualizar categorías usando la REST API de Firebase Realtime Database.
 * No requiere serviceAccountKey.json.
 *
 * Uso: node scripts/updateCategoriesREST.js
 */

const https = require('https');

const DATABASE_URL = 'superlista-ac191-default-rtdb.firebaseio.com';

function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function get(path) {
  return httpsRequest({ hostname: DATABASE_URL, path: `${path}.json`, method: 'GET' });
}

function put(path, body) {
  const bodyStr = JSON.stringify(body);
  return httpsRequest({
    hostname: DATABASE_URL,
    path: `${path}.json`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
  }, body);
}

async function main() {
  console.log('Leyendo categorías actuales de Firebase...\n');

  const response = await get('/Categories');

  if (response.status !== 200 || !response.data) {
    console.error('Error al leer categorías:', response.status, response.data);
    console.log('\n⚠ Si la base de datos requiere autenticación, este script no funcionará.');
    console.log('En ese caso, necesitás el serviceAccountKey.json en la carpeta scripts/.');
    process.exit(1);
  }

  const rawData = response.data;
  const categories = Object.values(rawData);

  console.log('=== CATEGORÍAS ACTUALES ===');
  categories.forEach((cat, i) => {
    console.log(`[${i}] ID: ${cat.id} | order: ${cat.order ?? 'N/A'} | title: "${cat.title}" | icon: ${cat.icon}`);
  });

  console.log('\n=== PROCESANDO CAMBIOS ===\n');

  let updated = categories.map(cat => ({ ...cat }));

  // 1. Renombrar Panadería → Harinas
  const panaderiaIdx = updated.findIndex(c => c.title.toLowerCase().includes('panader'));
  if (panaderiaIdx !== -1) {
    console.log(`✔ Renombrando "${updated[panaderiaIdx].title}" → "Harinas"`);
    updated[panaderiaIdx].title = 'Harinas';
    updated[panaderiaIdx].icon = '🌾';
    if (updated[panaderiaIdx].icons) {
      updated[panaderiaIdx].icons = ['🌾', '🍞', '🥐'];
    }
  } else {
    console.log('⚠ No se encontró categoría "Panadería" para renombrar.');
  }

  const maxId = Math.max(...updated.map(c => Number(c.id) || 0));
  let nextId = maxId + 1;

  // 2. Nueva categoría: Galletitas
  if (!updated.find(c => c.title.toLowerCase().includes('galletita'))) {
    console.log(`✔ Creando nueva categoría "Galletitas" (id: ${nextId})`);
    updated.push({ id: nextId, title: 'Galletitas', icon: '🍪', icons: ['🍪', '🥮'] });
    nextId++;
  } else {
    console.log('⚠ Ya existe "Galletitas", se omite.');
  }

  // 3. Nueva categoría: Snacks
  if (!updated.find(c => c.title.toLowerCase().includes('snack'))) {
    console.log(`✔ Creando nueva categoría "Snacks" (id: ${nextId})`);
    updated.push({ id: nextId, title: 'Snacks', icon: '🍿', icons: ['🍿', '🥜', '🍡'] });
    nextId++;
  } else {
    console.log('⚠ Ya existe "Snacks", se omite.');
  }

  // Detectar categorías clave
  const otros = updated.find(c => c.title.toLowerCase() === 'otros');
  const almacen = updated.find(c => c.title.toLowerCase().includes('almac'));
  const perfumeria = updated.find(c => c.title.toLowerCase().includes('perfumer'));

  console.log('\nCategorías clave:');
  console.log('  Otros:', otros ? `"${otros.title}" (id: ${otros.id})` : 'NO ENCONTRADO');
  console.log('  Almacén:', almacen ? `"${almacen.title}" (id: ${almacen.id})` : 'NO ENCONTRADO');
  console.log('  Perfumería:', perfumeria ? `"${perfumeria.title}" (id: ${perfumeria.id})` : 'NO ENCONTRADO');

  // Separar especiales
  const specialIds = new Set([otros?.id, almacen?.id, perfumeria?.id].filter(v => v !== undefined));
  const base = updated.filter(c => !specialIds.has(c.id));

  // Insertar Perfumería junto a Cuidado o Farmacia
  let finalOrder = [];
  let perfumeriaInserted = false;
  for (const cat of base) {
    finalOrder.push(cat);
    if (perfumeria && !perfumeriaInserted &&
      (cat.title.toLowerCase().includes('cuidado') || cat.title.toLowerCase().includes('farmacia'))) {
      finalOrder.push(perfumeria);
      perfumeriaInserted = true;
      console.log(`✔ Perfumería insertada luego de "${cat.title}"`);
    }
  }

  if (perfumeria && !perfumeriaInserted) {
    console.log('⚠ No se encontró Cuidado/Farmacia. Perfumería se agrega al final del bloque principal.');
    finalOrder.push(perfumeria);
  }

  // Al final: Otros → Almacén
  if (otros) { finalOrder.push(otros); console.log('✔ Otros → al final'); }
  if (almacen) { finalOrder.push(almacen); console.log('✔ Almacén → luego de Otros'); }

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

  const putResponse = await put('/Categories', categoriesObject);
  if (putResponse.status === 200) {
    console.log('\n✅ Categorías actualizadas correctamente en Firebase.');
  } else {
    console.error('\n❌ Error al guardar:', putResponse.status, putResponse.data);
    console.log('Las reglas de Firebase pueden estar bloqueando la escritura sin autenticación.');
    console.log('Necesitás el serviceAccountKey.json en la carpeta scripts/ para el script con Admin SDK.');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
