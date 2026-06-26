// src/services/carrefourService.js

// In-memory cache for fast lookups during the active session
const memoryCache = new Map();

// LocalStorage cache key
const STORAGE_KEY = 'superlista_carrefour_ean_cache';

// Helper to get cache from localStorage
const getStoredCache = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    console.error("Error reading localStorage cache", e);
    return {};
  }
};

// Helper to save cache to localStorage
const saveStoredCache = (cache) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error("Error saving localStorage cache", e);
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
 * Searches for a product on Carrefour's catalog API by EAN/barcode.
 * Caches the response to avoid duplicate requests.
 * 
 * @param {string} rawEan - The scanned barcode / EAN
 * @returns {Promise<Object|null>} The parsed product or null if not found
 */
export const fetchCarrefourProductByEan = async (rawEan) => {
  const ean = normalizeEan(rawEan);
  if (!ean) return null;

  // 1. Check in-memory cache
  if (memoryCache.has(ean)) {
    console.log(`[Cache Hit - Memory] EAN: ${ean}`);
    return memoryCache.get(ean);
  }

  // 2. Check localStorage cache
  const localCache = getStoredCache();
  if (localCache[ean] !== undefined) {
    console.log(`[Cache Hit - LocalStorage] EAN: ${ean}`);
    memoryCache.set(ean, localCache[ean]);
    return localCache[ean];
  }

  const directUrl = `https://www.carrefour.com.ar/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${ean}`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`;

  let responseData = null;

  // 3. Perform Fetch (Try direct first, fallback to CORS proxy)
  try {
    console.log(`[Fetch Direct] Querying Carrefour API for EAN: ${ean}`);
    const response = await fetch(directUrl);
    if (response.ok) {
      responseData = await response.json();
    } else {
      throw new Error(`Direct request failed with status: ${response.status}`);
    }
  } catch (directError) {
    console.warn(`[Fetch Direct Failed] Direct call failed due to CORS or Network. Trying CORS proxy.`, directError);
    try {
      console.log(`[Fetch Proxy] Querying Carrefour API via proxy for EAN: ${ean}`);
      const response = await fetch(proxyUrl);
      if (response.ok) {
        responseData = await response.json();
      } else {
        throw new Error(`Proxy request failed with status: ${response.status}`);
      }
    } catch (proxyError) {
      console.error(`[Fetch Failed] Both direct and proxy queries failed.`, proxyError);
      return null;
    }
  }

  // 4. Parse response
  if (!responseData || !Array.isArray(responseData) || responseData.length === 0) {
    console.log(`[Not Found] Product for EAN ${ean} not found in Carrefour.`);
    // Cache the negative result too to prevent repeated queries for unknown products
    memoryCache.set(ean, null);
    const updatedCache = { ...getStoredCache(), [ean]: null };
    saveStoredCache(updatedCache);
    return null;
  }

  try {
    const product = responseData[0];
    const item = product.items?.[0];
    const offer = item?.sellers?.[0]?.commertialOffer;

    if (!offer) {
      console.warn(`[Invalid Data] Product found but no active offer available.`);
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
      supermercado: 'Carrefour',
      brand: product.brand || '',
      ean: ean,
      imageUrl: item.images?.[0]?.imageUrl || null,
      productId: product.productId,
      itemId: item.itemId
    };

    console.log(`[Success] Found product: ${parsedProduct.nombre} - Price: $${parsedProduct.valor}`);

    // Save to caches
    memoryCache.set(ean, parsedProduct);
    const updatedCache = { ...getStoredCache(), [ean]: parsedProduct };
    saveStoredCache(updatedCache);

    return parsedProduct;
  } catch (parseError) {
    console.error(`[Parse Error] Failed to parse product details:`, parseError);
    return null;
  }
};
