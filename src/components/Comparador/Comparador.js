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
      let coords = null;
      try {
        if (navigator.geolocation) {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
          });
          coords = position.coords;
          setGpsStatus('Ubicación GPS obtenida. Buscando sucursales cercanas...');
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
      }
    } catch (err) {
      console.error("Error al inicializar sucursales:", err);
      setGpsStatus('Error al buscar sucursales.');
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
          setLoadingSteps((prev) => ({ ...prev, [brandId]: 'Procesando coincidencias...' }));

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

  return (
    <div className="comparador-container">
      <div className="comparador-header">
        <h2>Comparador de Precios</h2>
        <Button
          onClick={() => navigate('/')}
          size="small"
          variant="secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
          Mi Lista
        </Button>
      </div>

      <div className="gps-status-card">
        <span>📍</span>
        <p>{gpsStatus}</p>
        <Button size="small" variant="secondary" onClick={findClosestBranches} style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '0.75rem' }}>
          Recargar GPS
        </Button>
      </div>

      {/* Quick Add Form Section */}
      <div className="card quick-add-section">
        <h3>Agregar Producto Rápido</h3>
        <form onSubmit={handleQuickAdd} className="quick-add-form">
          <Input
            label="Nombre del Producto:"
            id="quickName"
            name="quickName"
            value={quickAddName}
            onChange={(e) => setQuickAddName(e.target.value)}
            placeholder="Ej: Leche Entera, Arroz Gallo"
            required
          />
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
            Agregar
          </Button>
        </form>
      </div>

      {/* List display & Comparison wrapper */}
      <div className="list-comparison-wrapper">
        <div className="card list-card">
          <h3>Mi Lista de Compras ({products.length})</h3>
          {products.length === 0 ? (
            <p style={{ color: 'var(--text-color-light)', textAlign: 'center', margin: '20px 0' }}>
              Tu lista está vacía. Agrega productos arriba para empezar la comparación.
            </p>
          ) : (
            <>
              <ul className="comparar-list-items">
                {products.map((item) => (
                  <li key={item.firebaseId} className="comparar-list-item">
                    <div className="item-info">
                      <span className="item-icon">{item.icon || '🛒'}</span>
                      <span className="item-name">{item.nombre}</span>
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
                  🔍 Buscar Supermercado Más Barato
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Loading and Results panel */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
          <h3>Resultados de Búsqueda</h3>

          {loading && (
            <div className="loader-section">
              <div className="custom-spinner"></div>
              <p style={{ fontWeight: '600' }}>Buscando precios en catálogos locales...</p>
              <div className="loader-steps">
                {Object.entries(loadingSteps).map(([brand, status]) => (
                  <div key={brand} className={`loader-step ${status === 'Completado' ? 'completed' : ''}`}>
                    <span style={{ textTransform: 'capitalize' }}>{brand}:</span>
                    <span>{status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && !results && (
            <p style={{ color: 'var(--text-color-light)', textAlign: 'center', margin: 'auto' }}>
              Presiona el botón de búsqueda para calcular qué supermercado te conviene.
            </p>
          )}

          {!loading && results && (
            <div className="results-wrapper">
              {results[0] && results[0].totalCost !== Infinity && (
                <div className="winner-banner">
                  <span className="winner-icon">🏆</span>
                  <div className="winner-info">
                    <h3>¡{results[0].brandName} es el más barato!</h3>
                    <p>
                      Total estimado de <strong>{results[0].totalCost.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</strong>
                    </p>
                    <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                      ({results[0].itemsFoundCount} de {results[0].totalItemsCount} productos encontrados)
                    </p>
                  </div>
                </div>
              )}

              <div className="supermarket-rank-list">
                {results.map((res, index) => {
                  const isWinner = index === 0 && res.totalCost !== Infinity;
                  const isLoadFailed = res.totalCost === Infinity;
                  const hasDetails = expandedSuper === res.brandId;

                  return (
                    <div
                      key={res.brandId}
                      className={`supermarket-rank-card ${isWinner ? 'is-winner' : ''}`}
                      onClick={() => toggleDetails(res.brandId)}
                    >
                      <div className="supermarket-rank-header">
                        <div className="super-logo-title-group">
                          <span className="rank-badge">{index + 1}</span>
                          <img
                            src={`logo_super/logo_${res.brandId}.png`}
                            alt={res.brandName}
                            className="supermarket-rank-logo"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                          <div>
                            <span className="supermarket-rank-name">{res.brandName}</span>
                            {res.branchInfo && (
                              <p className="supermarket-rank-branch">
                                Suc. {res.branchInfo.id_sucursal || res.branchInfo.id} - {res.branchInfo.nombre_sucursal || res.branchInfo.direccion_sucursal}
                                {res.branchInfo.distance && ` (${res.branchInfo.distance.toFixed(1)} km)`}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="supermarket-rank-pricing">
                          <span className="supermarket-rank-total">
                            {isLoadFailed ? 'Error de Carga' : res.totalCost.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                          </span>
                          <span className="supermarket-rank-found-ratio">
                            {res.itemsFoundCount}/{res.totalItemsCount}
                          </span>
                        </div>
                      </div>

                      {hasDetails && !isLoadFailed && (
                        <div className="supermarket-rank-details" onClick={(e) => e.stopPropagation()}>
                          {res.matches.map((match, idx) => (
                            <div key={idx} className="details-product-row">
                              <div>
                                <span className="details-product-name">{match.userProduct.nombre}</span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-color-light)', marginLeft: '4px' }}>
                                  (x{match.userProduct.cantidad})
                                </span>
                                {match.found && (
                                  <p className="details-product-match">
                                    Coincidencia: {match.matchedProduct.nombre} ({match.matchedProduct.marca_producto})
                                  </p>
                                )}
                              </div>
                              <div>
                                {match.found ? (
                                  <span className="details-product-price">
                                    {(match.price * match.userProduct.cantidad).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                                  </span>
                                ) : (
                                  <span className="details-product-notfound">No Encontrado</span>
                                )}
                              </div>
                            </div>
                          ))}

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
