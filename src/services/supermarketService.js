// src/services/supermarketService.js

// Auto-cleanup: Eliminar cachés viejas que no tienen timestamps (_ts)
// para que no se devuelvan precios desactualizados de sesiones anteriores.
try {
  ['carrefour', 'dia', 'changomas'].forEach(brand => {
    const key = `superlista_${brand}_ean_cache`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const data = JSON.parse(raw);
      const hasOldEntries = Object.values(data).some(v => v && !v._ts);
      if (hasOldEntries) {
        console.log(`[Cache Cleanup] Removing stale cache for ${brand} (old format without TTL)`);
        localStorage.removeItem(key);
      }
    }
  });
} catch (e) {
  console.warn('[Cache Cleanup] Error during cleanup:', e);
}

// Tiempo de vida de la caché: 30 minutos (para que los precios se actualicen)
const CACHE_TTL_MS = 30 * 60 * 1000;

// In-memory cache for fast lookups during the active session, separated by brand
const memoryCaches = {
  carrefour: new Map(),
  dia: new Map(),
  changomas: new Map()
};

// Helper to get cache from localStorage (with TTL check)
const getStoredCache = (brandKey) => {
  try {
    const raw = localStorage.getItem(`superlista_${brandKey}_ean_cache`);
    if (!raw) return {};
    const data = JSON.parse(raw);
    // Clean expired entries
    const now = Date.now();
    const cleaned = {};
    for (const [key, entry] of Object.entries(data)) {
      if (entry && entry._ts && (now - entry._ts) < CACHE_TTL_MS) {
        cleaned[key] = entry;
      }
    }
    return cleaned;
  } catch (e) {
    console.error(`Error reading localStorage cache for ${brandKey}`, e);
    return {};
  }
};

// Helper to save cache to localStorage
const saveStoredCache = (brandKey, cache) => {
  try {
    localStorage.setItem(`superlista_${brandKey}_ean_cache`, JSON.stringify(cache));
  } catch (e) {
    console.error(`Error saving localStorage cache for ${brandKey}`, e);
  }
};

/**
 * Normalizes barcode/EAN by removing leading zeros.
 */
export const normalizeEan = (code) => {
  if (!code) return '';
  return code.toString().trim().replace(/^0+/, '');
};

/**
 * Rutas del proxy local configuradas en setupProxy.js
 * El servidor de desarrollo de React redirige estas rutas a los dominios reales.
 */
const PROXY_PATHS = {
  carrefour: '/proxy-api/carrefour',
  dia: '/proxy-api/dia',
  changomas: '/proxy-api/changomas'
};

/**
 * URLs directas de las APIs de los supermercados (para producción o entornos sin proxy).
 */
const DIRECT_URLS = {
  carrefour: 'https://www.carrefour.com.ar',
  dia: 'https://diaonline.supermercadosdia.com.ar',
  changomas: 'https://www.masonline.com.ar'
};

/**
 * Searches for a product on a supermarket's catalog API by EAN/barcode.
 * Uses the local dev proxy to avoid CORS issues.
 * Caches the response with a TTL to keep prices fresh.
 * 
 * @param {string} rawEan - The scanned barcode / EAN
 * @param {string} brandKey - The brand key ('carrefour', 'dia', or 'changomas')
 * @returns {Promise<Object|null>} The parsed product or null if not found
 */
export const fetchProductByEan = async (rawEan, brandKey = 'carrefour') => {
  const ean = normalizeEan(rawEan);
  if (!ean) return null;

  const cacheBrand = memoryCaches[brandKey] ? brandKey : 'carrefour';
  const memoryCache = memoryCaches[cacheBrand];

  // 1. Check in-memory cache (with TTL)
  if (memoryCache.has(ean)) {
    const cached = memoryCache.get(ean);
    if (cached && cached._ts && (Date.now() - cached._ts) < CACHE_TTL_MS) {
      console.log(`[Cache Hit - Memory] Brand: ${cacheBrand}, EAN: ${ean}`);
      return cached;
    } else if (cached === null) {
      // Negative result cached recently — still skip
      console.log(`[Cache Hit - Memory (not found)] Brand: ${cacheBrand}, EAN: ${ean}`);
      return null;
    }
    // Expired, remove from memory
    memoryCache.delete(ean);
  }

  // 2. Check localStorage cache (with TTL)
  const localCache = getStoredCache(cacheBrand);
  if (localCache[ean] !== undefined) {
    console.log(`[Cache Hit - LocalStorage] Brand: ${cacheBrand}, EAN: ${ean}`);
    memoryCache.set(ean, localCache[ean]);
    return localCache[ean];
  }

  const directBase = DIRECT_URLS[cacheBrand];
  const apiPath = `/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`;

  let responseData = null;

  /**
   * Helper: intenta un fetch y parsea JSON. Retorna los datos o lanza un error.
   */
  const tryFetch = async (url, label) => {
    console.log(`[${label}] Querying ${brandKey} for EAN: ${ean} → ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${label} failed with status: ${response.status}`);
    }
    const text = await response.text();
    // Verificar que sea JSON válido (no una página HTML de error)
    if (text.startsWith('[') || text.startsWith('{')) {
      return JSON.parse(text);
    }
    throw new Error(`${label} returned non-JSON response`);
  };

  // Estrategias de fetch en orden de prioridad:
  const strategies = [
    // 1. Vercel Serverless Function (funciona en Vercel producción Y en dev con setupProxy)
    {
      label: 'Serverless Proxy',
      getUrl: () => `/api/supermarket-proxy?brand=${cacheBrand}&ean=${ean}`
    },
    // 2. Local dev proxy (funciona en desarrollo con npm start / setupProxy.js)
    {
      label: 'Dev Proxy',
      getUrl: () => `${PROXY_PATHS[cacheBrand]}${apiPath}`
    },
    // 3. Fetch directo (funciona en webviews móviles sin restricción CORS)
    {
      label: 'Direct Fetch',
      getUrl: () => `${directBase}${apiPath}`
    },
    // 4. CORS proxy público (corsproxy.io) - último recurso
    {
      label: 'CORS Proxy (corsproxy.io)',
      getUrl: () => `https://corsproxy.io/?${encodeURIComponent(`${directBase}${apiPath}`)}`
    },
    // 5. CORS proxy público (allorigins) - último recurso
    {
      label: 'CORS Proxy (allorigins)',
      getUrl: () => `https://api.allorigins.win/raw?url=${encodeURIComponent(`${directBase}${apiPath}`)}`
    }
  ];

  for (const strategy of strategies) {
    try {
      responseData = await tryFetch(strategy.getUrl(), strategy.label);
      break; // Si funciona, salimos del loop
    } catch (err) {
      console.warn(`[${strategy.label} Failed] ${err.message}`);
    }
  }

  if (!responseData) {
    console.error(`[Fetch Failed] All fetch strategies failed for ${brandKey}, EAN: ${ean}`);
    return null;
  }

  // 4. Parse response
  if (!responseData || !Array.isArray(responseData) || responseData.length === 0) {
    console.log(`[Not Found] Product for EAN ${ean} not found in ${brandKey}.`);
    // Cache the negative result in memory only (don't persist null to localStorage)
    memoryCache.set(ean, null);
    return null;
  }

  try {
    const product = responseData[0];
    const item = product.items?.[0];
    const offer = item?.sellers?.[0]?.commertialOffer;

    if (!offer) {
      console.warn(`[Invalid Data] Product found in ${brandKey} but no active offer available.`);
      return null;
    }

    // Extract promo info from DiscountHighLight
    let promo_leyenda = null;
    if (offer.DiscountHighLight && Array.isArray(offer.DiscountHighLight) && offer.DiscountHighLight.length > 0) {
      const match = offer.DiscountHighLight[0];
      if (match && match["<Name>k__BackingField"]) {
        promo_leyenda = match["<Name>k__BackingField"];
      }
    }

    // Extract quantity-based promos from PromotionTeasers (e.g., "2do al 50%")
    let promo_cantidad = null; // e.g., { min: 2, descuento: 50, leyenda: "2do al 50%" }
    const promotionTeasers = offer.PromotionTeasers || offer.Teasers || [];
    if (Array.isArray(promotionTeasers)) {
      for (const teaser of promotionTeasers) {
        const name = teaser.Name || teaser["<Name>k__BackingField"] || '';
        // Match patterns like "2do al 50%", "2da al 70%", "Reg-2-50"
        const regMatch = name.match(/Reg-(\d+)-(\d+)/i);
        if (regMatch) {
          const minQty = parseInt(regMatch[1], 10);
          const descPct = parseInt(regMatch[2], 10);
          if (minQty >= 2 && descPct > 0 && descPct <= 100) {
            // Extract human-readable promo text
            const humanMatch = name.match(/((?:2do|2da|3ro|3ra|\d+[a-z]{2})\s+al\s+\d+%)/i);
            const leyenda = humanMatch ? humanMatch[1] : `${minQty}° al ${descPct}%`;
            promo_cantidad = { min: minQty, descuento: descPct, leyenda };
            // Use this promo_leyenda if we don't already have one
            if (!promo_leyenda) {
              promo_leyenda = leyenda;
            }
            break;
          }
        }
      }
    }

    const parsedProduct = {
      nombre: product.productName || item.nameComplete || item.name || '',
      valor: offer.Price,
      precio_original: offer.ListPrice && offer.ListPrice > offer.Price ? offer.ListPrice : null,
      promo_leyenda: promo_leyenda,
      promo_cantidad: promo_cantidad,
      supermercado: brandKey === 'dia' ? 'Día' : (brandKey === 'changomas' ? 'Chango Más' : 'Carrefour'),
      brand: product.brand || '',
      ean: ean,
      imageUrl: item.images?.[0]?.imageUrl || null,
      productId: product.productId,
      itemId: item.itemId,
      categories: product.categories || [],
      _ts: Date.now() // Timestamp for cache TTL
    };

    console.log(`[Success] Found product in ${brandKey}: ${parsedProduct.nombre} - Price: $${parsedProduct.valor}`);

    // Save to caches
    memoryCache.set(ean, parsedProduct);
    const updatedCache = { ...getStoredCache(cacheBrand), [ean]: parsedProduct };
    saveStoredCache(cacheBrand, updatedCache);

    return parsedProduct;
  } catch (parseError) {
    console.error(`[Parse Error] Failed to parse product details from ${brandKey}:`, parseError);
    return null;
  }
};

/**
 * Searches for a product on Carrefour's catalog API by EAN/barcode.
 * (Kept for backwards compatibility).
 */
export const fetchCarrefourProductByEan = async (rawEan) => {
  return fetchProductByEan(rawEan, 'carrefour');
};
