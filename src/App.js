// src/App.js
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import { useAuth, AuthProvider } from './context/AuthContext';
import { subscribeToCategories, addCategory } from './services/firebaseService';
import { resolveProductCategory, getCategorySetForBrand } from './utils/categoryMapping';
import { UserListsProvider } from './context/UserListsContext';
import { ProductsProvider } from './context/ProductsContext';
import { useUserListsContext } from './context/UserListsContext';
import { useProductsContext } from './context/ProductsContext';

// Importa tus componentes
import Header from './components/header/Header';
import ProductForm from './components/ProductForm/ProductForm';
import ProductList from './components/ProductList/ProductList';
import AuthPage from './pages/AuthPage/AuthPage';
import SidebarMenu from './components/SidebarMenu/SidebarMenu';
import SearchBar from './components/SearchBar/SearchBar';
// Redundant import removed

import Button from './components/Buttons/Button';
import CategoryFilter from './components/CategoryFilter/CategoryFilter';
import Supermercados from './components/supermercados/Supermercados';
import Comparador from './components/Comparador/Comparador';
import { ProductListSkeleton } from './components/Skeleton/Skeleton';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { showErrorAlert, showSuccessToast } from './Notifications/NotificationsServices';
import { fetchProductByEan } from './services/supermarketService';

// Import local product data for scanner lookup
// Unused import removed


// Importa tus estilos
import './App.css';
import './components/header/Header.css';
import './components/Input/Input.css';
import './components/Select/Select.css';
import './TotalSummary/TotalSummary.css';
import './components/Buttons/Button.css';

// Unused constant removed


// Unused constant removed

// Haversine formula to calculate distance between two points in km
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2 - lat1);
  var dLon = deg2rad(lon2 - lon1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
    ;
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180)
}

function MainAppContent() {
  const navigate = useNavigate();
  const {

    currentListId,
    currentListName,
    loading: loadingLists,
  } = useUserListsContext();

  const {
    products,
    loadingProducts,
    addProduct,
    editProduct,
  } = useProductsContext();

  // State for categories, form visibility, editing, and search
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [lastCategoryId, setLastCategoryId] = useState(null);
  const [groupByCategory, setGroupByCategory] = useState(false);

  // GPS State
  const [detectedSupermarket, setDetectedSupermarket] = useState(null);

  // Scanner states
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef(null);
  const scannerIsRunningRef = useRef(false);

  // GPS Effect
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude } = position.coords;
        console.log("Ubicación del usuario:", latitude, longitude);

        const brandIds = ['carrefour', 'dia', 'changomas', 'jumbo', 'vea', 'vital', 'easy'];
        const THRESHOLD_KM = 2.0;

        Promise.all(brandIds.map(async (brandId) => {
          try {
            const response = await fetch(`/data/super/${brandId}.json`);
            if (!response.ok) return null;
            const branches = await response.json();

            // Find nearest branch for this brand
            let nearestForBrand = null;
            let minDistance = Infinity;

            branches.forEach(branch => {
              if (branch.latitud && branch.longitud) {
                const dist = getDistanceFromLatLonInKm(latitude, longitude, parseFloat(branch.latitud), parseFloat(branch.longitud));
                if (dist < minDistance) {
                  minDistance = dist;
                  nearestForBrand = {
                    brandKey: brandId,
                    name: branch.comercio_bandera_nombre || branch.marca || brandId,
                    branchData: branch,
                    distance: dist
                  };
                }
              }
            });

            if (nearestForBrand && nearestForBrand.distance < THRESHOLD_KM) {
              return nearestForBrand;
            }
          } catch (e) { }
          return null;
        })).then(foundBranches => {
          const validBranches = foundBranches.filter(b => b !== null).sort((a, b) => a.distance - b.distance);
          if (validBranches.length > 0) {
            const nearestStore = validBranches[0];
            setDetectedSupermarket(nearestStore);
            showSuccessToast(`📍 Estás en ${nearestStore.name} (${nearestStore.branchData.nombre_sucursal || nearestStore.branchData.id_sucursal})`);
          }
        });

      }, (error) => {
        // La detección de supermercado cercano es una mejora opcional:
        // si el usuario no dio permiso de GPS o falló, fallamos en silencio
        // en vez de interrumpirlo con un modal de error en cada carga.
        console.warn("Error obteniendo ubicación:", error);
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    } else {
      console.warn("Geolocalización no soportada en este navegador.");
    }
  }, []);

  // Effect for loading categories
  useEffect(() => {
    const unsubscribe = subscribeToCategories((loadedCategories) => {
      setCategories(loadedCategories);
      setLoadingCategories(false);
    });
    return () => unsubscribe();
  }, []);

  // Form handling logic
  const handleStartEditing = (product) => {
    setEditingProduct(product);
    setShowProductForm(true);
  };

  const handleCancelForm = () => {
    setEditingProduct(null);
    setShowProductForm(false);
  };

  const handleAddProduct = (productData) => {
    addProduct(productData);
    if (productData.category !== undefined && productData.category !== null) {
      setLastCategoryId(productData.category);
    }
    setShowProductForm(false);
  };

  const handleEditProduct = (firebaseId, productData) => {
    editProduct(firebaseId, productData);
    setEditingProduct(null);
    setShowProductForm(false);
  };

  const handleToggleForm = () => {
    if (editingProduct) {
      setEditingProduct(null);
    }
    setShowProductForm(prev => !prev);
  };

  // --- Barcode Scanner Logic ---
  const normalizeCode = (code) => {
    return code.replace(/^0+/, '');
  };

  const onScanSuccess = useCallback((decodedText, decodedResult) => {
    console.log(`Code scanned = ${decodedText}`, decodedResult);

    // Stop scanning
    setShowScanner(false);

    const normalizedScannedCode = normalizeCode(decodedText);
    console.log(`Normalized scanned code: ${normalizedScannedCode}`);

    const searchProduct = async () => {
      const activeBrand = detectedSupermarket ? detectedSupermarket.brandKey : 'carrefour';
      const isLiveSupported = ['carrefour', 'dia', 'changomas'].includes(activeBrand);

      // 1. Try real-time API lookup first (with caching) if the brand supports live API
      if (isLiveSupported) {
        try {
          const apiProduct = await fetchProductByEan(decodedText, activeBrand);
          if (apiProduct) {
            const resolvedCat = await resolveProductCategory(apiProduct.categories, categories, activeBrand, addCategory);
            setEditingProduct(prev => ({
              ...(prev || {}),
              nombre: apiProduct.nombre,
              valor: apiProduct.valor.toString(),
              precio_original: apiProduct.precio_original,
              promo_leyenda: apiProduct.promo_leyenda,
              promo_cantidad: apiProduct.promo_cantidad,
              category: resolvedCat ? resolvedCat.id : prev?.category || 0,
              icon: resolvedCat ? resolvedCat.icon : prev?.icon || '🛒',
              cantidad: prev ? prev.cantidad : 1,
            }));
            setShowProductForm(true);
            const brandLabel = activeBrand === 'dia' ? 'Día' : (activeBrand === 'changomas' ? 'Chango Más' : 'Carrefour');
            showSuccessToast(`Producto encontrado (${brandLabel} API): ${apiProduct.nombre}`);
            return;
          }
        } catch (err) {
          console.warn(`Error querying ${activeBrand} API, falling back to local files:`, err);
        }
      }

      // 2. Fallback to local supermarket database
      const brandIds = detectedSupermarket
        ? [detectedSupermarket.brandKey]
        : [];

      if (brandIds.length === 0) {
        showErrorAlert('Producto no encontrado', `No se encontró información para el código: ${decodedText}. Habilita el GPS o selecciona un supermercado.`);
        return;
      }

      try {
        const results = await Promise.all(brandIds.map(async (brandId) => {
          try {
            const branchId = detectedSupermarket.branchData.id_sucursal || detectedSupermarket.branchData.id;
            const response = await fetch(`/data/products/${brandId}/${branchId}.json`);
            if (!response.ok) return null;
            const products = await response.json();
            const found = products.find(p => {
              const idParts = (p.id || '').split('-');
              if (idParts.length > 0) {
                const idCodePart = idParts[0];
                return normalizeCode(idCodePart) === normalizedScannedCode;
              }
              return false;
            });
            return found;
          } catch (e) {
            return null;
          }
        }));

        const foundProduct = results.find(r => r !== null);
        if (foundProduct) {
          setEditingProduct(prev => ({
            ...(prev || {}),
            nombre: foundProduct.nombre,
            valor: foundProduct.mejor_precio || foundProduct.precio || '',
            precio_original: foundProduct.precio || null,
            promo_leyenda: foundProduct.promo_leyenda || null,
            cantidad: prev ? prev.cantidad : 1,
          }));
          setShowProductForm(true);
          showSuccessToast(`Producto encontrado: ${foundProduct.nombre}`);
        } else {
          showErrorAlert('Producto no encontrado', `No se encontró información para el código: ${decodedText} en esta sucursal.`);
        }
      } catch (err) {
        showErrorAlert('Error', `Ocurrió un error al buscar el producto.`);
      }
    };

    searchProduct();
  }, [detectedSupermarket, categories]);

  const handleCloseScanner = () => {
    setShowScanner(false);
  };

  useEffect(() => {
    let html5QrCode;
    if (showScanner) {
      // Small timeout to ensure DOM element exists
      const timer = setTimeout(() => {
        html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;
        scannerIsRunningRef.current = false;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128
          ]
        };

        Html5Qrcode.getCameras().then(devices => {
          if (devices && devices.length) {
            return html5QrCode.start(
              { facingMode: "environment" },
              config,
              onScanSuccess,
              () => { }
            );
          } else {
            throw new Error("No se detectaron cámaras.");
          }
        })
          .then(() => {
            scannerIsRunningRef.current = true;
          })
          .catch(err => {
            console.error("Error starting scanner:", err);
            let userMsg = `No se pudo iniciar la cámara.`;

            if (err.name === 'NotReadableError' || err.message?.includes('NotReadableError')) {
              userMsg = "La cámara parece estar en uso por otra aplicación o hay un fallo de hardware.";
            } else if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
              userMsg = "Permiso denegado. Habilita el acceso a la cámara.";
            } else if (err.name === 'NotFoundError') {
              userMsg = "No se encontró ninguna cámara.";
            }

            showErrorAlert('Error de Cámara', userMsg);
            setShowScanner(false);
          });
      }, 100);

      return () => {
        clearTimeout(timer);
        if (html5QrCode) {
          const stopScanner = async () => {
            if (scannerIsRunningRef.current) {
              try {
                await html5QrCode.stop();
              } catch (err) {
                console.warn("Error stopping scanner:", err);
              }
            }
            try {
              html5QrCode.clear();
            } catch (e) {
              console.warn("Error clearing scanner:", e);
            }
            scannerIsRunningRef.current = false;
          };
          stopScanner();
        }
      };
    }
  }, [showScanner, onScanSuccess]);

  // Categories offered when adding/editing a product: when a supermarket is
  // detected via GPS, show ONLY that brand's own main categories (+ Otros)
  // so the picker matches where the user is actually shopping. Without a
  // detected brand, fall back to the full saved list (every category from
  // every brand) so nothing is hidden.
  const formCategories = useMemo(() => {
    if (!detectedSupermarket) return categories;
    const brandIds = new Set(getCategorySetForBrand(detectedSupermarket.brandKey).map(c => c.id));
    const fromSaved = categories.filter(c => brandIds.has(c.id));
    return fromSaved.length > 0 ? fromSaved : categories;
  }, [categories, detectedSupermarket]);

  // Filtering and calculations
  const filteredProducts = products
    .filter(producto => {
      const matchesSearch = producto.nombre.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategoryId === '' || producto.category === parseInt(selectedCategoryId, 10);
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      // Sort by category first
      if (a.category !== b.category) {
        return (a.category || 0) - (b.category || 0);
      }
      // Then by name
      return a.nombre.localeCompare(b.nombre);
    });

  const totalProductos = filteredProducts.length;
  const totalGeneral = products.reduce((sum, producto) => {
    if (!producto.completed) {
      return sum + ((producto.valor || 0) * (producto.cantidad || 0));
    }
    return sum;
  }, 0);

  const totalAhorro = products.reduce((sum, producto) => {
    const precioOriginal = Number(producto.precio_original || 0);
    const precioActual = Number(producto.valor || 0);

    if (!producto.completed && precioOriginal > 0 && precioOriginal > precioActual) {
      return sum + ((precioOriginal - precioActual) * (producto.cantidad || 0));
    }
    return sum;
  }, 0);

  const hasDecimals = totalGeneral % 1 !== 0;
  const formattedTotal = totalGeneral.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0
  });

  return (
    <div className="App">
      <Header />
      <div className="container">
        <SidebarMenu />

        <div className="main-content-area">
          {loadingLists ? (
            <ProductListSkeleton rows={3} />
          ) : currentListId ? (
            <>
              <div className="list-header">
                <div className="list-summary-banner">
                  <div className="list-summary-content">
                    {totalAhorro > 0 && (
                      <span className="list-summary-savings">
                        ⚡ Ahorrás {totalAhorro.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })} esta semana
                      </span>
                    )}
                    <div className="list-summary-meta">
                      {currentListName || 'Cargando...'} · {totalProductos || 0} producto{totalProductos === 1 ? '' : 's'}
                    </div>
                    <div className="list-summary-total">{formattedTotal}</div>
                    {detectedSupermarket && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${detectedSupermarket.branchData.latitud},${detectedSupermarket.branchData.longitud}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="detected-super-link"
                      >
                        📍 {detectedSupermarket.name}
                        {' '}<span className="detected-super-arrow">↗️</span>
                      </a>
                    )}
                  </div>
                  <div className="list-summary-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path>
                      <path d="M3 6h18"></path>
                      <path d="M16 10a4 4 0 0 1-8 0"></path>
                    </svg>
                  </div>
                </div>

                <div className="category-tabs-wrapper" style={{ width: '100%', overflow: 'hidden' }}>
                  <CategoryFilter
                    categories={categories}
                    selectedCategoryId={selectedCategoryId}
                    onSelectCategory={setSelectedCategoryId}
                    groupByCategory={groupByCategory}
                    onToggleGroupBy={() => setGroupByCategory(prev => !prev)}
                  />
                </div>
              </div>
              {loadingProducts ? (
                <ProductListSkeleton rows={4} />
              ) : (
                <ProductList
                  productos={filteredProducts}
                  busqueda={searchTerm}
                  onEditar={handleStartEditing}
                  categories={categories}
                  groupByCategory={groupByCategory}
                />
              )}
            </>
          ) : (
            <div className="empty-state card">
              <div className="empty-icon">📂</div>
              <h3 className="empty-title">Crea o selecciona una lista</h3>
              <p className="empty-description">Usá el menú (☰) para gestionar tus listas de compras.</p>
            </div>
          )}
        </div>

        {showProductForm && <div className="backdrop-blur" onClick={handleCancelForm}></div>}

        {currentListId && (
          <div className="fixed-bottom-controls">
            {!showProductForm && (
              <div className="bottom-controls-header">
                <SearchBar
                  busqueda={searchTerm}
                  setBusqueda={setSearchTerm}
                />
                <div className="action-buttons-container">
                  <Button
                    onClick={() => navigate('/supermercados')}
                    variant="secondary"
                    icon={(
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                      </svg>
                    )}
                    className="explore-super-button btn-square"
                    title="Explorar Precios"
                  >
                    Precios
                  </Button>
                  <Button
                    onClick={() => navigate('/comparar')}
                    variant="secondary"
                    icon={(
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10"></line>
                        <line x1="12" y1="20" x2="12" y2="4"></line>
                        <line x1="6" y1="20" x2="6" y2="14"></line>
                      </svg>
                    )}
                    className="compare-button btn-square"
                    title="Comparar Precios"
                  >
                    Comparar
                  </Button>
                  <Button
                    onClick={handleToggleForm}
                    variant="primary"
                    icon={(
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    )}
                    className="toggle-form-button btn-square"
                  >
                    Agregar
                  </Button>
                  <Button
                    onClick={() => setShowScanner(true)}
                    variant="secondary"
                    icon={(
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                        <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                        <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                        <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                        <path d="M8 7v10" />
                        <path d="M12 7v10" />
                        <path d="M16 7v10" />
                        <line x1="4" y1="12" x2="20" y2="12" />
                      </svg>
                    )}
                    className="scan-product-button btn-square"
                  >
                    Escanear
                  </Button>
                </div>
              </div>
            )}

            {showProductForm && (
              loadingCategories ? (
                <p className="loading-message">Cargando categorías...</p>
              ) : (
                <ProductForm
                  editandoId={editingProduct ? editingProduct.firebaseId : null}
                  productoAEditar={editingProduct}
                  onAgregar={handleAddProduct}
                  onEditar={handleEditProduct}
                  onCancelar={handleCancelForm}
                  categories={formCategories}
                  onScan={() => setShowScanner(true)}
                  lastCategoryId={lastCategoryId}
                />
              )
            )}
          </div>
        )}

        {/* Scanner Modal - Rendered outside fixed-bottom-controls for proper centering */}
        {showScanner && (
          <div className="scanner-modal-overlay">
            <div className="scanner-modal-content">
              <h3>Escanear Código de Barras</h3>
              <div id="reader"></div>
              <div className="scanner-actions" style={{ marginTop: '20px' }}>
                <Button onClick={handleCloseScanner} variant="secondary">
                  Cerrar Escáner
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AppRouter() {
  const { currentUser } = useAuth();
  const [authLoaded, setAuthLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAuthLoaded(true);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  if (!authLoaded) {
    return (
      <div className="loading-auth" role="status" aria-label="Cargando">
        <img src="/logo.svg" alt="" className="loading-auth-icon" />
        <div className="loading-auth-spinner"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/auth" element={currentUser ? <Navigate to="/" /> : <AuthPage />} />
      {/* Ruta para la aplicación principal (tus listas) */}
      <Route path="/" element={currentUser ? <MainAppContent /> : <Navigate to="/auth" />} />
      {/* NUEVA RUTA PARA SUPERMERCADOS */}
      <Route path="/supermercados" element={
        currentUser ? (
          <div className="App">
            <Header />
            <div className="container">
              <SidebarMenu />
              <div className="main-content-area" style={{ paddingBottom: '20px' }}>
                <Supermercados />
              </div>
            </div>
          </div>
        ) : <Navigate to="/auth" />
      } />
      <Route path="/comparar" element={
        currentUser ? (
          <div className="App">
            <Header />
            <div className="container">
              <SidebarMenu />
              <div className="main-content-area" style={{ paddingBottom: '20px' }}>
                <Comparador />
              </div>
            </div>
          </div>
        ) : <Navigate to="/auth" />
      } />
      {/* Opcional: Redirigir a una ruta por defecto si la URL no coincide con ninguna */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <UserListsProvider>
          <ProductsProvider>
            <AppRouter />
          </ProductsProvider>
        </UserListsProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;