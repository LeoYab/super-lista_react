// api/supermarket-proxy.js
// Vercel Serverless Function que actúa como proxy hacia las APIs de supermercados.
// Elimina los problemas de CORS porque la petición sale del servidor de Vercel (mismo origen).

const BRAND_URLS = {
  carrefour: 'https://www.carrefour.com.ar',
  dia: 'https://diaonline.supermercadosdia.com.ar',
  changomas: 'https://www.masonline.com.ar'
};

module.exports = async (req, res) => {
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
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);
  } catch (error) {
    console.error(`Error proxying to ${brand}:`, error);
    return res.status(500).json({ error: 'Error al consultar la API del supermercado' });
  }
};
