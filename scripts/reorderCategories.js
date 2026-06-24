/**
 * reorderCategories.js
 * Pone Otros en posicion 1 y Almacén en posicion 2.
 */

const https = require('https');
const DATABASE_URL = 'superlista-ac191-default-rtdb.firebaseio.com';

function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
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
  console.log('Leyendo categorías actuales...\n');
  const response = await get('/Categories');

  if (response.status !== 200 || !response.data) {
    console.error('Error al leer:', response.status);
    process.exit(1);
  }

  // Ordenar por order actual para ver el estado
  let categories = Object.values(response.data).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  console.log('=== CATEGORÍAS ACTUALES (por order) ===');
  categories.forEach(cat => {
    console.log(`[order: ${cat.order}] ID: ${cat.id} | "${cat.title}" ${cat.icon}`);
  });

  // Extraer Otros y Almacén
  const otros = categories.find(c => c.title.toLowerCase() === 'otros');
  const almacen = categories.find(c => c.title.toLowerCase().includes('almac'));

  if (!otros) { console.error('No se encontró "Otros"'); process.exit(1); }
  if (!almacen) { console.error('No se encontró "Almacén"'); process.exit(1); }

  // Resto de categorías (sin Otros ni Almacén)
  const rest = categories.filter(c => c.id !== otros.id && c.id !== almacen.id);

  // Nuevo orden: Otros (1), Almacén (2), resto (3, 4, ...)
  const finalOrder = [otros, almacen, ...rest].map((cat, idx) => ({ ...cat, order: idx + 1 }));

  console.log('\n=== NUEVO ORDEN FINAL ===');
  finalOrder.forEach(cat => {
    console.log(`[${cat.order}] ID: ${cat.id} | "${cat.title}" ${cat.icon}`);
  });

  console.log('\n⚡ Guardando en Firebase...');
  const obj = {};
  finalOrder.forEach(cat => { obj[cat.id] = cat; });

  const res = await put('/Categories', obj);
  if (res.status === 200) {
    console.log('✅ Orden actualizado correctamente.');
  } else {
    console.error('❌ Error:', res.status, res.data);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
