// src/services/supermarketService.js

// Auto-cleanup: Eliminar cachés viejas que no tienen timestamps (_ts)
// para que no se devuelvan precios desactualizados de sesiones anteriores.
try {
  ['carrefour', 'dia', 'changomas', 'jumbo', 'vea'].forEach(brand => {
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
  changomas: new Map(),
  jumbo: new Map(),
  vea: new Map()
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
  changomas: '/proxy-api/changomas',
  jumbo: '/proxy-api/jumbo',
  vea: '/proxy-api/vea'
};

/**
 * URLs directas de las APIs de los supermercados (para producción o entornos sin proxy).
 */
const DIRECT_URLS = {
  carrefour: 'https://www.carrefour.com.ar',
  dia: 'https://diaonline.supermercadosdia.com.ar',
  changomas: 'https://www.masonline.com.ar',
  jumbo: 'https://www.jumbo.com.ar',
  vea: 'https://www.vea.com.ar'
};

/**
 * Fetches JSON from a supermarket's catalog API, trying each transport in
 * order until one works: Vercel serverless proxy, dev/nginx proxy, direct
 * fetch and (optionally) public CORS proxies as a last resort.
 *
 * @param {Object} options
 * @param {string} options.brandKey - 'carrefour' | 'dia' | 'changomas'
 * @param {string} options.apiPath - Path + query on the store's own domain
 * @param {string} options.proxyQuery - Query string for the serverless proxy
 * @param {string} options.describe - Short text for logs
 * @param {boolean} [options.allowPublicProxies=true] - Public CORS proxies
 *   see the request, so callers can opt out for anything user-typed.
 * @returns {Promise<Array|Object|null>} Parsed JSON, or null if all failed
 */
const fetchFromBrandApi = async ({ brandKey, apiPath, proxyQuery, describe, allowPublicProxies = true }) => {
  const directBase = DIRECT_URLS[brandKey];

  const tryFetch = async (url, label) => {
    console.log(`[${label}] Querying ${brandKey} for ${describe} → ${url}`);
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

  const strategies = [
    // 1. Vercel Serverless Function (funciona en Vercel producción)
    { label: 'Serverless Proxy', getUrl: () => `/api/supermarket-proxy?brand=${brandKey}&${proxyQuery}` },
    // 2. Proxy local (setupProxy.js en desarrollo, nginx en Docker)
    { label: 'Dev Proxy', getUrl: () => `${PROXY_PATHS[brandKey]}${apiPath}` },
    // 3. Fetch directo (funciona en webviews móviles sin restricción CORS)
    { label: 'Direct Fetch', getUrl: () => `${directBase}${apiPath}` },
  ];

  if (allowPublicProxies) {
    strategies.push(
      // 4-5. CORS proxies públicos - último recurso
      { label: 'CORS Proxy (corsproxy.io)', getUrl: () => `https://corsproxy.io/?${encodeURIComponent(`${directBase}${apiPath}`)}` },
      { label: 'CORS Proxy (allorigins)', getUrl: () => `https://api.allorigins.win/raw?url=${encodeURIComponent(`${directBase}${apiPath}`)}` }
    );
  }

  for (const strategy of strategies) {
    try {
      return await tryFetch(strategy.getUrl(), strategy.label);
    } catch (err) {
      console.warn(`[${strategy.label} Failed] ${err.message}`);
    }
  }
  return null;
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

  const apiPath = `/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`;

  const responseData = await fetchFromBrandApi({
    brandKey: cacheBrand,
    apiPath,
    proxyQuery: `ean=${ean}`,
    describe: `EAN: ${ean}`,
  });

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

/** Brands whose website exposes a public VTEX catalog API we can search live. */
export const LIVE_SEARCH_BRANDS = ['carrefour', 'dia', 'changomas', 'jumbo', 'vea'];

const BRAND_LABELS = {
  carrefour: 'Carrefour', dia: 'Día', changomas: 'Chango Más',
  jumbo: 'Jumbo', vea: 'Vea'
};

// Short cache so "show more" and repeated searches don't re-hit the store.
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const searchCache = new Map();

// Maps a VTEX product to the shape the product cards already render. Returns
// null for products with no purchasable price (unavailable on the website).
const parseSearchProduct = (product, brandKey) => {
  const item = (product.items || []).find(i => i.sellers?.[0]?.commertialOffer?.Price > 0);
  if (!item) return null;

  const offer = item.sellers[0].commertialOffer;
  const price = offer.Price;
  const hasDiscount = offer.ListPrice > price;
  const highlight = Array.isArray(offer.DiscountHighLight) ? offer.DiscountHighLight[0] : null;

  return {
    id: `${brandKey}-${product.productId}-${item.itemId}`,
    nombre: product.productName || item.nameComplete || item.name || '',
    marca_producto: product.brand || '',
    precio: hasDiscount ? offer.ListPrice : price,
    precio_oferta: hasDiscount ? price : null,
    mejor_precio: price,
    promo1_leyenda: (highlight && highlight['<Name>k__BackingField']) || '',
    stock: (offer.AvailableQuantity ?? 0) > 0,
    ean: item.ean || '',
    imagen_url: item.images?.[0]?.imageUrl || null,
    categories: product.categories || [],
    supermercado_marca: BRAND_LABELS[brandKey] || brandKey,
  };
};

/**
 * Searches a supermarket's website catalog by free text (like typing in the
 * store's own search box). Prices are the website's, not branch-specific.
 *
 * @param {string} term - What the user typed
 * @param {string} brandKey - One of LIVE_SEARCH_BRANDS
 * @param {Object} [options]
 * @param {number} [options.from=0] - Offset of the first result to fetch
 * @param {number} [options.pageSize=20] - Results per page (VTEX allows up to 50)
 * @returns {Promise<{products: Array, hasMore: boolean, rawCount: number}|null>}
 *   `rawCount` is how many results the store returned (before dropping
 *   unavailable ones), to use as the next offset. Null if the store could not
 *   be reached, so the caller can fall back to something else.
 */
export const searchProductsByText = async (term, brandKey, { from = 0, pageSize = 20 } = {}) => {
  const cleaned = (term || '').trim();
  if (!cleaned || !LIVE_SEARCH_BRANDS.includes(brandKey)) return null;

  const cacheKey = `${brandKey}|${cleaned.toLowerCase()}|${from}|${pageSize}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL_MS) return cached.value;

  const to = from + pageSize - 1;
  const encoded = encodeURIComponent(cleaned);

  const data = await fetchFromBrandApi({
    brandKey,
    // OrderByScoreDESC = the store's own relevance order (without it a search
    // for "leche" lists "arroz con leche" and gadgets before actual milk).
    apiPath: `/api/catalog_system/pub/products/search?ft=${encoded}&_from=${from}&_to=${to}&O=OrderByScoreDESC`,
    proxyQuery: `ft=${encoded}&from=${from}&to=${to}`,
    describe: `search "${cleaned}"`,
    // What the user types shouldn't go through third-party CORS proxies.
    allowPublicProxies: false,
  });

  if (!Array.isArray(data)) return null;

  const value = {
    products: data.map(p => parseSearchProduct(p, brandKey)).filter(Boolean),
    hasMore: data.length >= pageSize,
    rawCount: data.length,
  };
  searchCache.set(cacheKey, { ts: Date.now(), value });
  return value;
};

/**
 * Searches for a product on Carrefour's catalog API by EAN/barcode.
 * (Kept for backwards compatibility).
 */
export const fetchCarrefourProductByEan = async (rawEan) => {
  return fetchProductByEan(rawEan, 'carrefour');
};

// fetchProductByEan returns the barcode-scan shape; the comparator (like the
// search results) works with the catalog shape.
const eanProductToCatalogShape = (product, brandKey) => ({
  id: `${brandKey}-${product.productId}-${product.itemId}`,
  nombre: product.nombre,
  marca_producto: product.brand || '',
  precio: product.precio_original || product.valor,
  precio_oferta: product.precio_original ? product.valor : null,
  mejor_precio: product.valor,
  promo1_leyenda: product.promo_leyenda || '',
  ean: product.ean,
  supermercado_marca: BRAND_LABELS[brandKey] || brandKey,
});

// How many not-yet-common barcodes get looked up in the stores that did not
// list them in their own results (each lookup is one request).
const MAX_EAN_CROSS_LOOKUPS = 4;

/**
 * Resolves a generic search ("queso") to one specific product that exists in
 * every given store, identified by its barcode (EAN), so all stores are
 * compared on the exact same item. Among the products available everywhere it
 * picks the one with the lowest combined price.
 *
 * If no barcode is found in all stores, it falls back to the barcode found in
 * the most stores (`complete: false`).
 *
 * @param {string} term - What the user wrote in the list
 * @param {string[]} brandKeys - Stores to compare (from LIVE_SEARCH_BRANDS)
 * @returns {Promise<{ean: string, byBrand: Object, complete: boolean}|null>}
 *   `byBrand` maps each store to its product (catalog shape). Null if nothing
 *   was found in any store.
 */
export const findCheapestCommonProduct = async (term, brandKeys) => {
  const searches = await Promise.all(
    brandKeys.map(async (brandKey) => ({
      brandKey,
      result: await searchProductsByText(term, brandKey, { pageSize: 30 }),
    }))
  );

  // Stores that could not be reached, or that list nothing for this search,
  // must not veto every candidate.
  const reachable = searches.filter(s => s.result?.products.length > 0).map(s => s.brandKey);
  if (reachable.length === 0) return null;

  // ean -> { brandKey: product }; keeps the cheapest listing per store.
  const byEan = new Map();
  searches.forEach(({ brandKey, result }) => {
    (result?.products || []).forEach((product) => {
      const ean = normalizeEan(product.ean);
      if (!ean || !(product.mejor_precio > 0)) return;
      if (!byEan.has(ean)) byEan.set(ean, {});
      const entry = byEan.get(ean);
      if (!entry[brandKey] || product.mejor_precio < entry[brandKey].mejor_precio) {
        entry[brandKey] = product;
      }
    });
  });
  if (byEan.size === 0) return null;

  const totalPrice = (entry) => Object.values(entry).reduce((sum, p) => sum + p.mejor_precio, 0);
  const coversAll = (entry) => reachable.every(b => entry[b]);

  const pickBest = () => {
    let best = null;
    byEan.forEach((entry, ean) => {
      const count = Object.keys(entry).length;
      const candidate = { ean, byBrand: entry, count, total: totalPrice(entry) };
      if (!best || candidate.count > best.count ||
        (candidate.count === best.count && candidate.total < best.total)) {
        best = candidate;
      }
    });
    return best;
  };

  let best = pickBest();

  // Nothing listed by every store's own results: ask the missing stores for
  // the cheapest candidates by barcode.
  if (!coversAll(best.byBrand) && reachable.length > 1) {
    const candidates = [...byEan.entries()]
      .sort((a, b) => Math.min(...Object.values(a[1]).map(p => p.mejor_precio)) -
        Math.min(...Object.values(b[1]).map(p => p.mejor_precio)))
      .slice(0, MAX_EAN_CROSS_LOOKUPS);

    await Promise.all(candidates.flatMap(([ean, entry]) =>
      reachable.filter(b => !entry[b]).map(async (brandKey) => {
        const found = await fetchProductByEan(ean, brandKey);
        if (found && found.valor > 0) entry[brandKey] = eanProductToCatalogShape(found, brandKey);
      })
    ));
    best = pickBest();
  }

  return { ean: best.ean, byBrand: best.byBrand, complete: coversAll(best.byBrand) };
};
