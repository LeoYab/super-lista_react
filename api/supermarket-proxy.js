// api/supermarket-proxy.js
// Vercel Serverless Function que actúa como proxy hacia las APIs de supermercados.
// Elimina los problemas de CORS porque la petición sale del servidor de Vercel (mismo origen).

const BRAND_URLS = {
  carrefour: 'https://www.carrefour.com.ar',
  dia: 'https://diaonline.supermercadosdia.com.ar',
  changomas: 'https://www.masonline.com.ar'
};

// Orígenes desde los que se permite llamar a este endpoint.
// Configurable vía env var para no hardcodear el dominio de producción.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

// Rate limiting básico en memoria (por instancia serverless "caliente").
// No es robusto entre instancias frías, pero frena ráfagas de abuso baratas.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const requestLog = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intentá de nuevo en un minuto.' });
  }

  const { brand, ean } = req.query;

  // Validaciones
  if (!brand || !BRAND_URLS[brand]) {
    return res.status(400).json({ error: 'Brand inválido. Usar: carrefour, dia, o changomas' });
  }
  if (!ean || !/^\d+$/.test(ean)) {
    return res.status(400).json({ error: 'EAN inválido' });
  }

  const baseUrl = BRAND_URLS[brand];
  const apiUrl = `${baseUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SuperLista/1.0'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `API responded with ${response.status}` });
    }

    const data = await response.json();

    // Permitir caché en el edge por 5 minutos, pero revalidar
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (error) {
    console.error(`Error proxying to ${brand}:`, error);
    return res.status(500).json({ error: 'Error al consultar la API del supermercado' });
  }
};
