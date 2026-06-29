// src/services/supermarketService.js

// In-memory cache for fast lookups during the active session, separated by brand
const memoryCaches = {
  carrefour: new Map(),
  dia: new Map(),
  changomas: new Map()
};

// Helper to get cache from localStorage
const getStoredCache = (brandKey) => {
  try {
    const data = localStorage.getItem(`superlista_${brandKey}_ean_cache`);
    return data ? JSON.parse(data) : {};
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
 * Searches for a product on a supermarket's catalog API by EAN/barcode.
 * Caches the response to avoid duplicate requests.
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

  // 1. Check in-memory cache
  if (memoryCache.has(ean)) {
    console.log(`[Cache Hit - Memory] Brand: ${cacheBrand}, EAN: ${ean}`);
    return memoryCache.get(ean);
  }

  // 2. Check localStorage cache
  const localCache = getStoredCache(cacheBrand);
  if (localCache[ean] !== undefined) {
    console.log(`[Cache Hit - LocalStorage] Brand: ${cacheBrand}, EAN: ${ean}`);
    memoryCache.set(ean, localCache[ean]);
    return localCache[ean];
  }

  // Define base URL based on brand
  let baseUrl = 'https://www.carrefour.com.ar';
  if (brandKey === 'dia') {
    baseUrl = 'https://diaonline.supermercadosdia.com.ar';
  } else if (brandKey === 'changomas') {
    baseUrl = 'https://www.masonline.com.ar';
  }

  const directUrl = `${baseUrl}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`;

  let responseData = null;

  // 3. Perform Fetch (Try direct first, fallback to CORS proxies)
  try {
    console.log(`[Fetch Direct] Querying ${brandKey} API for EAN: ${ean}`);
    const response = await fetch(directUrl);
    if (response.ok) {
      responseData = await response.json();
    } else {
      throw new Error(`Direct request failed with status: ${response.status}`);
    }
  } catch (directError) {
    console.warn(`[Fetch Direct Failed] Direct call to ${brandKey} failed. Trying CORS Proxy 1 (corsproxy.io).`, directError);
    
    // Fallback 1: corsproxy.io
    try {
      const proxy1Url = `https://corsproxy.io/?${encodeURIComponent(directUrl)}`;
      console.log(`[Fetch Proxy 1] Querying ${brandKey} API via corsproxy.io for EAN: ${ean}`);
      const response = await fetch(proxy1Url);
      if (response.ok) {
        responseData = await response.json();
      } else {
        throw new Error(`Proxy 1 request failed with status: ${response.status}`);
      }
    } catch (proxy1Error) {
      console.warn(`[Fetch Proxy 1 Failed] Proxy 1 failed. Trying CORS Proxy 2 (allorigins).`, proxy1Error);
      
      // Fallback 2: allorigins.win
      try {
        console.log(`[Fetch Proxy 2] Querying ${brandKey} API via allorigins for EAN: ${ean}`);
        const response = await fetch(proxyUrl);
        if (response.ok) {
          responseData = await response.json();
        } else {
          throw new Error(`Proxy 2 request failed with status: ${response.status}`);
        }
      } catch (proxy2Error) {
        console.error(`[Fetch Failed] All direct and proxy queries failed for ${brandKey}.`, proxy2Error);
        return null;
      }
    }
  }

  // 4. Parse response
  if (!responseData || !Array.isArray(responseData) || responseData.length === 0) {
    console.log(`[Not Found] Product for EAN ${ean} not found in ${brandKey}.`);
    // Cache the negative result too to prevent repeated queries for unknown products
    memoryCache.set(ean, null);
    const updatedCache = { ...getStoredCache(cacheBrand), [ean]: null };
    saveStoredCache(cacheBrand, updatedCache);
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

    // Extract promo info
    let promo_leyenda = null;
    if (offer.DiscountHighLight && Array.isArray(offer.DiscountHighLight) && offer.DiscountHighLight.length > 0) {
      const match = offer.DiscountHighLight[0];
      if (match && match["<Name>k__BackingField"]) {
        promo_leyenda = match["<Name>k__BackingField"];
      }
    }

    const parsedProduct = {
      nombre: product.productName || item.nameComplete || item.name || '',
      valor: offer.Price,
      precio_original: offer.ListPrice && offer.ListPrice > offer.Price ? offer.ListPrice : null,
      promo_leyenda: promo_leyenda,
      supermercado: brandKey === 'dia' ? 'Día' : (brandKey === 'changomas' ? 'Chango Más' : 'Carrefour'),
      brand: product.brand || '',
      ean: ean,
      imageUrl: item.images?.[0]?.imageUrl || null,
      productId: product.productId,
      itemId: item.itemId,
      categories: product.categories || []
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
