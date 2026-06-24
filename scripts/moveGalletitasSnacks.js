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
  const response = await get('/Categories');
  if (response.status !== 200 || !response.data) { console.error('Error al leer'); process.exit(1); }

  // Ordenar por order actual
  let cats = Object.values(response.data).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  // Extraer Galletitas y Snacks
  const galletitas = cats.find(c => c.title.toLowerCase().includes('galletita'));
  const snacks = cats.find(c => c.title.toLowerCase().includes('snack'));
  const harinas = cats.find(c => c.title.toLowerCase().includes('harina'));

  if (!galletitas) { console.error('No se encontró Galletitas'); process.exit(1); }
  if (!snacks) { console.error('No se encontró Snacks'); process.exit(1); }
  if (!harinas) { console.error('No se encontró Harinas'); process.exit(1); }

  // Filtrar los tres del array
  const base = cats.filter(c => c.id !== galletitas.id && c.id !== snacks.id && c.id !== harinas.id);

  // Insertar harinas, galletitas, snacks en la posicion correcta
  const finalOrder = [];
  for (const cat of base) {
    finalOrder.push(cat);
    if (cat.id === harinas.id) { // nunca pasa porque harinas fue filtrada
      finalOrder.push(harinas, galletitas, snacks);
    }
  }

  // Reconstruir insertando harinas + galletitas + snacks en el lugar donde estaba harinas
  const finalOrder2 = [];
  for (const cat of base) {
    // Si el NEXT en el orden original era Harinas, la insertamos aquí junto a Galletitas y Snacks
    finalOrder2.push(cat);
  }

  // Mejor enfoque: encontrar el índice de Harinas dentro del base (no está) → insertar grupo completo donde Harinas estaba originalmente
  // El order de harinas era 4, entonces insertamos en posición justo después del item con order original 3 (Lácteos)
  const harinaOriginalOrder = harinas.order;
  const insertAfterItem = base.find(c => c.order === harinaOriginalOrder - 1);

  const result = [];
  for (const cat of base) {
    result.push(cat);
    if (insertAfterItem && cat.id === insertAfterItem.id) {
      result.push(harinas, galletitas, snacks);
    }
  }

  // Si insertAfterItem no fue encontrado (edge case), forzamos insertar al principio del grupo
  // Mejor aun: simplemente reconstruir con orden fijo
  const sorted = Object.values(response.data).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const otherCats = sorted.filter(c => c.id !== galletitas.id && c.id !== snacks.id);
  
  const finalFinal = [];
  for (const cat of otherCats) {
    finalFinal.push(cat);
    if (cat.id === harinas.id) {
      finalFinal.push(galletitas, snacks);
    }
  }

  const withOrder = finalFinal.map((cat, idx) => ({ ...cat, order: idx + 1 }));

  console.log('=== NUEVO ORDEN ===');
  withOrder.forEach(cat => console.log(`[${cat.order}] "${cat.title}" ${cat.icon}`));

  const obj = {};
  withOrder.forEach(cat => { obj[cat.id] = cat; });

  const res = await put('/Categories', obj);
  if (res.status === 200) console.log('\n✅ Orden actualizado.');
  else console.error('❌ Error:', res.status);
}

main().catch(err => { console.error(err); process.exit(1); });
