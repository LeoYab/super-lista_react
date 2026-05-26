// src/components/Comparador/Comparador.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProductsContext } from '../../context/ProductsContext';
import { useUserListsContext } from '../../context/UserListsContext';
import { subscribeToCategories } from '../../services/firebaseService';
import { showErrorAlert, showSuccessToast } from '../../Notifications/NotificationsServices';
import Input from '../Input/Input';
import Button from '../Buttons/Button';
import './Comparador.css';

// Haversine distance calculator in km
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const Comparador = () => {
  const navigate = useNavigate();
  const { products, addProduct, editProduct, deleteProduct } = useProductsContext();
  const { currentListId } = useUserListsContext();

  const [categories, setCategories] = useState([]);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddQty, setQuickAddQty] = useState('1');

  // Comparison states
  const [loading, setLoading] = useState(false);
  const [loadingSteps, setLoadingSteps] = useState({});
  const [results, setResults] = useState(null);
  const [closestBranches, setClosestBranches] = useState({});
  const [gpsStatus, setGpsStatus] = useState('Buscando ubicación...');
  const [gpsState, setGpsState] = useState('idle'); // idle, loading, success, warning, error
  const [expandedSuper, setExpandedSuper] = useState(null);

  // Subscribe to categories
  useEffect(() => {
    const unsubscribe = subscribeToCategories((loadedCategories) => {
      setCategories(loadedCategories);
    });
    return () => unsubscribe();
  }, []);

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
      const brands = await response.json();

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
                  const dist = getDistance(
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

  // Handle quick adding of products
  const handleQuickAdd = (e) => {
    e.preventDefault();
    if (!currentListId) {
      showErrorAlert('No hay lista seleccionada', 'Por favor, selecciona o crea una lista primero.');
      return;
    }

    if (!quickAddName.trim()) {
      showErrorAlert('Error', 'Por favor, ingresa el nombre del producto.');
      return;
    }

    const defaultCategory = categories.find(cat => cat.title.toLowerCase() === 'otros') ||
      categories[0] ||
      { id: 'otros', icon: '🛒' };

    const parsedQty = parseInt(quickAddQty, 10);
    if (isNaN(parsedQty) || parsedQty < 1) {
      showErrorAlert('Error', 'La cantidad debe ser mayor o igual a 1.');
      return;
    }

    const newProduct = {
      nombre: quickAddName.trim(),
      valor: 0, // No price initially
      cantidad: parsedQty,
      category: defaultCategory.id,
      icon: defaultCategory.icon,
      precio_original: null,
      promo_leyenda: null,
      supermercado: null
    };

    addProduct(newProduct);
    showSuccessToast(`¡"${quickAddName}" agregado a la lista!`);
    setQuickAddName('');
    setQuickAddQty('1');
  };

  // Main list comparison algorithm
  const handleCompare = async () => {
    if (products.length === 0) {
      showErrorAlert('Lista vacía', 'Agrega productos a tu lista antes de buscar.');
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

    // Fetch and search catalogs for each supermarket
    await Promise.all(
      Object.entries(closestBranches).map(async ([brandId, info]) => {
        const branchId = info.branchData.id_sucursal || info.branchData.id;
        try {
          const res = await fetch(`/data/products/${brandId}/${branchId}.json`);
          if (!res.ok) {
            throw new Error(`Catálogo no encontrado`);
          }

          const catalog = await res.json();
          setLoadingSteps((prev) => ({ ...prev, [brandId]: 'Procesando...' }));

          let totalCost = 0;
          let itemsFoundCount = 0;
          const matches = [];

          products.forEach((userProduct) => {
            const queryWords = userProduct.nombre.toLowerCase().trim().split(/\s+/);
            let cheapestMatch = null;

            // Search for products that match all words in the user query
            catalog.forEach((item) => {
              const nameLower = (item.nombre || '').toLowerCase();
              const brandLower = (item.marca_producto || '').toLowerCase();
              const fullSearchText = `${nameLower} ${brandLower}`;

              const matchesAll = queryWords.every((word) => fullSearchText.includes(word));

              if (matchesAll) {
                const itemPrice = item.mejor_precio || item.precio || 0;
                if (itemPrice > 0) {
                  if (!cheapestMatch || itemPrice < (cheapestMatch.mejor_precio || cheapestMatch.precio)) {
                    cheapestMatch = item;
                  }
                }
              }
            });

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

    // Sort by total cost (ascending), placing failures at the bottom
    comparisonResults.sort((a, b) => {
      if (a.totalCost === Infinity) return 1;
      if (b.totalCost === Infinity) return -1;
      return a.totalCost - b.totalCost;
    });

    setResults(comparisonResults);
    setLoading(false);
  };

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
      <div className="comparador-header">
        <div className="header-title-wrapper">
          <span className="header-decor-bar"></span>
          <h2>Comparador de Precios</h2>
        </div>
        <Button
          onClick={() => navigate('/')}
          size="small"
          variant="secondary"
          className="back-list-btn"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
          Mi Lista
        </Button>
      </div>

      <div className={`gps-status-card gps-state-${gpsState}`}>
        <span className="gps-indicator-dot"></span>
        <span className="gps-icon">📍</span>
        <p>{gpsStatus}</p>
        <button className="gps-reload-btn" onClick={findClosestBranches}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          Actualizar
        </button>
      </div>

      {/* Quick Add Form Section */}
      <div className="card quick-add-section">
        <div className="section-title-wrapper">
          <h3>Agregar Producto Rápido</h3>
          <p className="section-subtitle">Agrega elementos sin precio para compararlos en un toque</p>
        </div>
        <form onSubmit={handleQuickAdd} className="quick-add-form">
          <div className="input-group name-group">
            <Input
              label="Nombre del Producto:"
              id="quickName"
              name="quickName"
              value={quickAddName}
              onChange={(e) => setQuickAddName(e.target.value)}
              placeholder="Ej: Leche Entera, Arroz Gallo"
              required
            />
          </div>
          <div className="qty-input-group">
            <Input
              label="Cant:"
              id="quickQty"
              name="quickQty"
              type="number"
              min="1"
              value={quickAddQty}
              onChange={(e) => setQuickAddQty(e.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="primary" className="quick-add-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Agregar
          </Button>
        </form>
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
              <p className="placeholder-subtext">Agrega productos en el formulario de arriba para iniciar la comparación.</p>
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
                    <button
                      onClick={() => deleteProduct(item.firebaseId)}
                      className="delete-item-btn"
                      title="Eliminar"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="search-cheapest-btn-wrapper">
                <Button
                  onClick={handleCompare}
                  variant="primary"
                  className="search-cheapest-btn"
                  disabled={loading}
                >
                  <span className="search-btn-icon">🔍</span>
                  Buscar Supermercado Más Barato
                </Button>
              </div>
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
              <p className="loader-title">Buscando precios en catálogos locales...</p>
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
              <p>Esperando comparación...</p>
              <p className="placeholder-subtext">Hacé clic en el botón de búsqueda para comparar precios en tiempo real.</p>
            </div>
          )}

          {!loading && results && (
            <div className="results-wrapper">
              {results[0] && results[0].totalCost !== Infinity && (
                <div className="winner-banner">
                  <span className="winner-icon">🏆</span>
                  <div className="winner-info">
                    <span className="winner-tag">MÁS ECONÓMICO</span>
                    <h3>¡{results[0].brandName} es la mejor opción!</h3>
                    <p className="winner-price">
                      Costo estimado: <strong>{results[0].totalCost.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</strong>
                    </p>
                    <p className="winner-stats">
                      Se encontraron {results[0].itemsFoundCount} de {results[0].totalItemsCount} productos.
                    </p>
                  </div>
                </div>
              )}

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
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
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
