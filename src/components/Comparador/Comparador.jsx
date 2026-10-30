// src/components/Comparador/Comparador.js
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProductsContext } from '../../context/ProductsContext';
import { showErrorAlert, showSuccessToast } from '../../Notifications/NotificationsServices';
import { ArrowLeft, RefreshCw, ChevronDown } from 'lucide-react';
import Button from '../Buttons/Button';
import './Comparador.css';
import { getDistanceKm } from '../../utils/geo';
import { LIVE_SEARCH_BRANDS, findCheapestCommonProduct } from '../../services/supermarketService';

const Comparador = () => {
  const navigate = useNavigate();
  const { products, editProduct } = useProductsContext();

  // Comparison states
  const [loading, setLoading] = useState(false);
  const [loadingSteps, setLoadingSteps] = useState({});
  const [results, setResults] = useState(null);
  const [closestBranches, setClosestBranches] = useState({});
  const [gpsStatus, setGpsStatus] = useState('Buscando ubicación...');
  const [gpsState, setGpsState] = useState('idle'); // idle, loading, success, warning, error
  const [expandedSuper, setExpandedSuper] = useState(null);

  // Fetch and calculate closest branch for all supermarkets
  const findClosestBranches = useCallback(async () => {
    try {
      setGpsStatus('Buscando ubicación GPS...');
      setGpsState('loading');
      let coords = null;
      try {
        if (navigator.geolocation) {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
          });
          coords = position.coords;
          setGpsStatus('Ubicación GPS obtenida. Buscando sucursales...');
        } else {
          setGpsStatus('Geolocalización no soportada. Usando sucursales por defecto.');
        }
      } catch (gpsError) {
        console.warn("GPS error, falling back to default branches:", gpsError);
        setGpsStatus('GPS no disponible. Usando sucursales por defecto.');
      }

      const response = await fetch('/data/supermarkets_list.json');
      if (!response.ok) throw new Error('No se pudo cargar la lista de supermercados.');
      // Only stores with a live website catalog are compared.
      const brands = (await response.json()).filter((brand) => LIVE_SEARCH_BRANDS.includes(brand.id));

      const branchMappings = {};

      await Promise.all(
        brands.map(async (brand) => {
          try {
            const res = await fetch(`/data/super/${brand.id}.json`);
            if (!res.ok) return;
            const branches = await res.json();

            let selectedBranch = null;

            if (coords && branches.length > 0) {
              let minDistance = Infinity;
              branches.forEach((branch) => {
                if (branch.latitud && branch.longitud) {
                  const dist = getDistanceKm(
                    coords.latitude,
                    coords.longitude,
                    parseFloat(branch.latitud),
                    parseFloat(branch.longitud)
                  );
                  if (dist < minDistance) {
                    minDistance = dist;
                    selectedBranch = { ...branch, distance: dist };
                  }
                }
              });
            }

            // Fallback to first branch if no GPS coords or mapping failed
            if (!selectedBranch && branches.length > 0) {
              selectedBranch = { ...branches[0], distance: null };
            }

            if (selectedBranch) {
              branchMappings[brand.id] = {
                brandName: brand.nombre,
                branchData: selectedBranch,
              };
            }
          } catch (e) {
            console.error(`Error al cargar sucursales de ${brand.id}:`, e);
          }
        })
      );

      setClosestBranches(branchMappings);
      if (coords) {
        setGpsStatus('Sucursales más cercanas calculadas.');
        setGpsState('success');
      } else {
        setGpsStatus('Ubicación GPS no disponible. Usando sucursales por defecto.');
        setGpsState('warning');
      }
    } catch (err) {
      console.error("Error al inicializar sucursales:", err);
      setGpsStatus('Error al buscar sucursales.');
      setGpsState('error');
    }
  }, []);

  // Run on mount to initialize nearest branches
  useEffect(() => {
    findClosestBranches();
  }, [findClosestBranches]);

  // Bumped on every run so a slow, outdated run never overwrites newer results.
  const runIdRef = useRef(0);

  // Main list comparison algorithm
  const handleCompare = async () => {
    const runId = ++runIdRef.current;
    if (products.length === 0) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setResults(null);
    setExpandedSuper(null);

    const steps = {};
    Object.keys(closestBranches).forEach((key) => {
      steps[key] = 'Cargando catálogo...';
    });
    setLoadingSteps(steps);

    const comparisonResults = [];

    // Each list item is resolved to ONE product
    // (by barcode) that exists in all of them, so they are compared on the
    // exact same item. One item at a time to go easy on the stores' servers.
    const liveBrandIds = Object.keys(closestBranches);
    const liveMatchesByProduct = new Map();
    if (liveBrandIds.length > 0) {
      for (let i = 0; i < products.length; i++) {
        const userProduct = products[i];
        setLoadingSteps((prev) => {
          const next = { ...prev };
          liveBrandIds.forEach((id) => { next[id] = `Buscando "${userProduct.nombre}" (${i + 1}/${products.length})...`; });
          return next;
        });
        try {
          liveMatchesByProduct.set(userProduct, await findCheapestCommonProduct(userProduct.nombre, liveBrandIds));
        } catch (e) {
          console.error(`Error buscando "${userProduct.nombre}":`, e);
          liveMatchesByProduct.set(userProduct, null);
        }
      }
    }

    // Build each supermarket's result from the resolved products
    await Promise.all(
      Object.entries(closestBranches).map(async ([brandId, info]) => {
        try {
          setLoadingSteps((prev) => ({ ...prev, [brandId]: 'Procesando...' }));

          let totalCost = 0;
          let itemsFoundCount = 0;
          const matches = [];

          products.forEach((userProduct) => {
            const cheapestMatch = liveMatchesByProduct.get(userProduct)?.byBrand[brandId] || null;

            if (cheapestMatch) {
              const price = cheapestMatch.mejor_precio || cheapestMatch.precio || 0;
              totalCost += price * userProduct.cantidad;
              itemsFoundCount++;
              matches.push({
                userProduct,
                matchedProduct: cheapestMatch,
                price: price,
                subtotal: price * userProduct.cantidad,
                found: true,
              });
            } else {
              matches.push({
                userProduct,
                matchedProduct: null,
                price: 0,
                subtotal: 0,
                found: false,
              });
            }
          });

          comparisonResults.push({
            brandId,
            brandName: info.brandName,
            branchInfo: info.branchData,
            totalCost,
            itemsFoundCount,
            totalItemsCount: products.length,
            matches,
          });

          setLoadingSteps((prev) => ({ ...prev, [brandId]: 'Completado' }));
        } catch (e) {
          console.error(`Error comparando en ${info.brandName}:`, e);
          setLoadingSteps((prev) => ({ ...prev, [brandId]: `Error: ${e.message}` }));
          comparisonResults.push({
            brandId,
            brandName: info.brandName,
            branchInfo: info.branchData,
            totalCost: Infinity,
            itemsFoundCount: 0,
            totalItemsCount: products.length,
            matches: [],
            error: e.message,
          });
        }
      })
    );

    // A store that finds fewer of your products has a lower total only because
    // it is missing items, so rank by products found first (most first), then
    // by total cost. Failures go last.
    comparisonResults.sort((a, b) => {
      if (a.totalCost === Infinity) return 1;
      if (b.totalCost === Infinity) return -1;
      if (a.itemsFoundCount !== b.itemsFoundCount) return b.itemsFoundCount - a.itemsFoundCount;
      return a.totalCost - b.totalCost;
    });

    if (runId !== runIdRef.current) return;
    setResults(comparisonResults);
    setLoading(false);
  };

  // The comparison runs by itself whenever the list (names/quantities) or the
  // nearest branches change, so there is no search button.
  const compareRef = useRef(handleCompare);
  compareRef.current = handleCompare;
  const compareKey = useMemo(() => {
    const listKey = products.map((p) => `${p.nombre}|${p.cantidad}`).join('¦');
    const branchKey = Object.entries(closestBranches)
      .map(([id, info]) => `${id}:${info.branchData.id_sucursal || info.branchData.id}`)
      .join(',');
    return `${listKey}#${branchKey}`;
  }, [products, closestBranches]);

  useEffect(() => {
    if (Object.keys(closestBranches).length === 0) return undefined;
    const timer = setTimeout(() => compareRef.current(), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareKey]);

  // Optional: Apply the prices of the winner supermarket to the user list
  const handleApplyPrices = async (supermarketResult) => {
    try {
      let count = 0;
      await Promise.all(
        supermarketResult.matches.map(async (match) => {
          if (match.found && match.userProduct.firebaseId) {
            const updatedProduct = {
              nombre: match.userProduct.nombre,
              valor: match.price.toString(),
              cantidad: match.userProduct.cantidad.toString(),
              category: match.userProduct.category,
              icon: match.userProduct.icon,
              precio_original: match.matchedProduct.precio || null,
              promo_leyenda: match.matchedProduct.promo1_leyenda || null,
              supermercado: supermarketResult.brandName,
            };
            await editProduct(match.userProduct.firebaseId, updatedProduct);
            count++;
          }
        })
      );
      showSuccessToast(`¡Se aplicaron los precios de ${supermarketResult.brandName} a ${count} productos!`);
    } catch (err) {
      console.error("Error al actualizar precios:", err);
      showErrorAlert('Error', 'No se pudieron actualizar todos los precios.');
    }
  };

  const toggleDetails = (brandId) => {
    setExpandedSuper(expandedSuper === brandId ? null : brandId);
  };

  const getRankBadgeContent = (idx) => {
    if (idx === 0) return '🥇';
    if (idx === 1) return '🥈';
    if (idx === 2) return '🥉';
    return `#${idx + 1}`;
  };

  const getRankClass = (idx) => {
    if (idx === 0) return 'rank-first';
    if (idx === 1) return 'rank-second';
    if (idx === 2) return 'rank-third';
    return 'rank-default';
  };

  return (
    <div className="comparador-container">
      <div className="comparador-header" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <Button
          onClick={() => navigate('/')}
          variant="secondary"
          className="back-button-circle"
          title="Volver a Mi Lista"
          style={{
            minWidth: '42px',
            width: '42px',
            height: '42px',
            padding: 0,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: 'none',
            border: '1px solid var(--border-color)'
          }}
        >
          <ArrowLeft size={20} strokeWidth={2.5} />
        </Button>
        <h2 style={{ margin: 0, fontSize: '1.8rem', textAlign: 'left' }}>
          Comparador
        </h2>
      </div>

      <div className={`gps-status-card gps-state-${gpsState}`}>
        <span className="gps-indicator-dot"></span>
        <span className="gps-icon">📍</span>
        <p>{gpsStatus}</p>
        <button className="gps-reload-btn" onClick={findClosestBranches}>
          <RefreshCw size={14} strokeWidth={2.5} />
          Actualizar
        </button>
      </div>

      {/* List display & Comparison wrapper */}
      <div className="list-comparison-wrapper">
        <div className="card list-card">
          <div className="card-header-with-count">
            <h3>Mi Lista de Compras</h3>
            <span className="items-count-badge">{products.length}</span>
          </div>
          
          {products.length === 0 ? (
            <div className="empty-list-placeholder">
              <div className="placeholder-icon">🛒</div>
              <p>Tu lista está vacía.</p>
              <p className="placeholder-subtext">Agregá productos en Mi Lista y acá vas a ver enseguida en qué supermercado te conviene comprar.</p>
              <Button onClick={() => navigate('/')} variant="primary">Ir a Mi Lista</Button>
            </div>
          ) : (
            <>
              <ul className="comparar-list-items">
                {products.map((item) => (
                  <li key={item.firebaseId} className="comparar-list-item">
                    <div className="item-info">
                      <span className="item-icon-wrapper">{item.icon || '🛒'}</span>
                      <div className="item-name-details">
                        <span className="item-name">{item.nombre}</span>
                      </div>
                      <span className="item-qty">x{item.cantidad}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Loading and Results panel */}
        <div className="card results-card">
          <h3>Resultados de Búsqueda</h3>

          {loading && (
            <div className="loader-section">
              <div className="spinner-wrapper">
                <div className="custom-spinner"></div>
                <div className="spinner-pulse"></div>
              </div>
              <p className="loader-title">Buscando precios en los supermercados...</p>
              <div className="loader-steps">
                {Object.entries(loadingSteps).map(([brand, status]) => {
                  const isCompleted = status === 'Completado';
                  const isFailed = status.startsWith('Error');
                  return (
                    <div key={brand} className={`loader-step ${isCompleted ? 'completed' : isFailed ? 'failed' : 'loading'}`}>
                      <span className="brand-name">{brand}</span>
                      <span className="step-status">
                        {isCompleted ? (
                          <span className="status-badge success">✓ Listo</span>
                        ) : isFailed ? (
                          <span className="status-badge error">✗ Falló</span>
                        ) : (
                          <span className="status-badge pending">
                            <span className="mini-spinner"></span>
                            {status}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && !results && (
            <div className="empty-results-placeholder">
              <div className="placeholder-icon">📊</div>
              <p>Sin resultados todavía</p>
              <p className="placeholder-subtext">Cuando tengas productos en tu lista, la comparación aparece acá sola.</p>
            </div>
          )}

          {!loading && results && (
            <div className="results-wrapper">
              {results[0] && results[0].totalCost !== Infinity && results[0].itemsFoundCount > 0 && (() => {
                // Savings only against stores that found as many products as the winner.
                const comparable = results.filter((r) => r.totalCost !== Infinity && r.itemsFoundCount === results[0].itemsFoundCount);
                const mostExpensive = comparable[comparable.length - 1];
                const savings = comparable.length > 1 ? mostExpensive.totalCost - results[0].totalCost : 0;
                const missingCount = results[0].totalItemsCount - results[0].itemsFoundCount;

                return (
                  <div className="winner-banner">
                    <span className="winner-icon">🏆</span>
                    <div className="winner-info">
                      <span className="winner-tag">{missingCount > 0 ? 'Mejor opción hoy' : 'Más barato hoy'}</span>
                      <h3>{results[0].brandName}</h3>
                      <p className="winner-price">
                        {results[0].totalCost.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                      </p>
                      {savings > 0 && (
                        <p className="winner-savings">
                          Ahorrás {savings.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })} vs. {mostExpensive.brandName}
                        </p>
                      )}
                      <p className="winner-stats">
                        Se encontraron {results[0].itemsFoundCount} de {results[0].totalItemsCount} productos.
                        {missingCount > 0 && ` El total no incluye ${missingCount} sin encontrar.`}
                      </p>
                    </div>
                  </div>
                );
              })()}

              <div className="supermarket-rank-list">
                {results.map((res, index) => {
                  const isWinner = index === 0 && res.totalCost !== Infinity;
                  const isLoadFailed = res.totalCost === Infinity;
                  const hasDetails = expandedSuper === res.brandId;
                  const ratio = res.totalItemsCount > 0 ? (res.itemsFoundCount / res.totalItemsCount) : 0;
                  
                  let ratioClass = 'ratio-low';
                  if (ratio === 1) ratioClass = 'ratio-high';
                  else if (ratio >= 0.5) ratioClass = 'ratio-mid';

                  return (
                    <div
                      key={res.brandId}
                      className={`supermarket-rank-card ${isWinner ? 'is-winner' : ''} ${hasDetails ? 'is-expanded' : ''}`}
                      onClick={() => toggleDetails(res.brandId)}
                    >
                      <div className="supermarket-rank-header">
                        <div className="super-logo-title-group">
                          <span className={`rank-badge ${getRankClass(index)}`}>
                            {getRankBadgeContent(index)}
                          </span>
                          <img
                            src={`logo_super/logo_${res.brandId}.png`}
                            alt={res.brandName}
                            className="supermarket-rank-logo"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                          <div className="super-info-labels">
                            <span className="supermarket-rank-name">{res.brandName}</span>
                            {res.branchInfo && (
                              <p className="supermarket-rank-branch">
                                {res.branchInfo.nombre_sucursal || `Suc. ${res.branchInfo.id_sucursal || res.branchInfo.id}`}
                                {res.branchInfo.distance && ` • ${res.branchInfo.distance.toFixed(1)} km`}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="supermarket-rank-pricing">
                          <span className="supermarket-rank-total">
                            {isLoadFailed ? 'Error de Carga' : res.totalCost.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                          </span>
                          <span className={`supermarket-rank-found-ratio ${ratioClass}`}>
                            {res.itemsFoundCount}/{res.totalItemsCount}
                          </span>
                          <span className="expand-chevron-icon">
                            <ChevronDown size={16} strokeWidth={2.5} />
                          </span>
                        </div>
                      </div>

                      {hasDetails && !isLoadFailed && (
                        <div className="supermarket-rank-details" onClick={(e) => e.stopPropagation()}>
                          <div className="details-header-row">
                            <span>Producto de tu lista</span>
                            <span className="text-right">Mejor coincidencia / Subtotal</span>
                          </div>
                          
                          {res.matches.map((match, idx) => {
                            const originalPrice = match.matchedProduct ? match.matchedProduct.precio : null;
                            const currentPrice = match.price;
                            const hasDiscount = originalPrice && Number(originalPrice) > Number(currentPrice);
                            
                            const originalTotal = originalPrice ? Number(originalPrice) * match.userProduct.cantidad : null;
                            const currentTotal = Number(currentPrice) * match.userProduct.cantidad;

                            return (
                              <div key={idx} className="details-product-row">
                                <div className="details-left">
                                  <div className="product-title-group">
                                    <span className="details-product-name">{match.userProduct.nombre}</span>
                                    <span className="details-product-qty">x{match.userProduct.cantidad}</span>
                                  </div>
                                  {match.found && (
                                    <div className="details-product-match-container">
                                      <span className="match-icon">↳</span>
                                      <span className="details-product-match">
                                        {match.matchedProduct.nombre} {match.matchedProduct.marca_producto && `• ${match.matchedProduct.marca_producto}`}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <div className="details-right">
                                  {match.found ? (
                                    <div className="price-details-group">
                                      <div className="price-numbers">
                                        {hasDiscount && (
                                          <span className="details-original-price">
                                            {originalTotal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                                          </span>
                                        )}
                                        <span className={`details-product-price ${hasDiscount ? 'has-discount' : ''}`}>
                                          {currentTotal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                                        </span>
                                      </div>
                                      {match.matchedProduct.promo1_leyenda && (
                                        <span className="promo-badge-tag" title={match.matchedProduct.promo1_leyenda}>
                                          🏷️ {match.matchedProduct.promo1_leyenda}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="details-product-notfound">No Encontrado</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          <div className="apply-prices-btn-wrapper">
                            <Button
                              onClick={() => handleApplyPrices(res)}
                              variant="secondary"
                              size="small"
                              className="apply-prices-btn"
                            >
                              ✍️ Aplicar precios a mi lista
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Comparador;
