// src/App.js
import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import { useAuth, AuthProvider } from './context/AuthContext';
import { subscribeToCategories, addCategory } from './services/firebaseService';
import { resolveProductCategory, getCategorySetForBrand, MAPPED_BRANDS, CATEGORY_BRANDS } from './utils/categoryMapping';
import { getDistanceKm } from './utils/geo';
import useScrollCollapse from './hooks/useScrollCollapse';
import { UserListsProvider } from './context/UserListsContext';
import { ProductsProvider } from './context/ProductsContext';
import { useUserListsContext } from './context/UserListsContext';
import { useProductsContext } from './context/ProductsContext';

// Importa tus componentes
import Header from './components/header/Header';
import ProductForm from './components/ProductForm/ProductForm';
import ProductList from './components/ProductList/ProductList';
import SidebarMenu from './components/SidebarMenu/SidebarMenu';
import SearchBar from './components/SearchBar/SearchBar';
// Redundant import removed

import Button from './components/Buttons/Button';
import CategoryFilter from './components/CategoryFilter/CategoryFilter';
import { ProductListSkeleton } from './components/Skeleton/Skeleton';

import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { ShoppingBag, MapPin, BarChart2, Plus, ScanBarcode } from 'lucide-react';
import { showErrorAlert, showSuccessToast } from './Notifications/NotificationsServices';
import { fetchProductByEan } from './services/supermarketService';

// Import local product data for scanner lookup
// Unused import removed


// Importa tus estilos
import './App.css';
import './components/header/Header.css';
import './components/Input/Input.css';
import './components/Select/Select.css';
import './components/Buttons/Button.css';

// Route-level code splitting: these pull in heavy deps (html5-qrcode, large
// catalog-browsing UI) that shouldn't be in the initial bundle.
const AuthPage = lazy(() => import('./pages/AuthPage/AuthPage'));
const Supermercados = lazy(() => import('./components/supermercados/Supermercados'));
const Comparador = lazy(() => import('./components/Comparador/Comparador'));

// Reorders getUserMedia camera devices so the main/wide rear lens comes
// first. Phones with multiple rear cameras often enumerate an ultra-wide
// or telephoto lens before the standard one; those have worse close-focus
// behavior and make a barcode look smaller/farther in frame, which is the
// most common cause of "the scanner won't recognize the code". Front
// cameras are pushed to the very end since they're never useful here.
function sortCamerasForBarcodeScan(devices) {
  const scoreOf = (label = '') => {
    const l = label.toLowerCase();
    if (/front|user|face/.test(l)) return 3;
    if (/ultra.?wide|wide.?angle|fish.?eye/.test(l)) return 2;
    if (/tele/.test(l)) return 1;
    return 0;
  };
  return [...devices].sort((a, b) => scoreOf(a.label) - scoreOf(b.label));
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

  // Collapses the list-header (hides the category chips, shrinks the
  // summary banner) while the user scrolls down the product list, to give
  // it more vertical room; expands again near the top or on scroll-up.
  const { isCollapsed: isListHeaderCollapsed, sentinelRef: scrollCollapseSentinelRef } = useScrollCollapse();

  // GPS State
  const [detectedSupermarket, setDetectedSupermarket] = useState(null);

  // Scanner states
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef(null);
  const scannerIsRunningRef = useRef(false);
  const camerasRef = useRef([]);
  const zoomFeatureRef = useRef(null);
  const [activeCameraIndex, setActiveCameraIndex] = useState(0);
  const [cameraCount, setCameraCount] = useState(0);
  const [zoomInfo, setZoomInfo] = useState(null);

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
                const dist = getDistanceKm(latitude, longitude, parseFloat(branch.latitud), parseFloat(branch.longitud));
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
    setActiveCameraIndex(0);
    setCameraCount(0);
    setZoomInfo(null);
    camerasRef.current = [];
    zoomFeatureRef.current = null;
  };

  const handleSwitchCamera = () => {
    if (camerasRef.current.length < 2) return;
    setActiveCameraIndex(prev => (prev + 1) % camerasRef.current.length);
  };

  const handleZoomChange = (e) => {
    const value = parseFloat(e.target.value);
    setZoomInfo(prev => (prev ? { ...prev, value } : prev));
    if (zoomFeatureRef.current) {
      zoomFeatureRef.current.apply(value).catch(() => { });
    }
  };

  useEffect(() => {
    let html5QrCode;
    if (showScanner) {
      // Small timeout to ensure DOM element exists
      const timer = setTimeout(() => {
        html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;
        scannerIsRunningRef.current = false;
        zoomFeatureRef.current = null;

        const config = {
          fps: 10,
          // Wider-than-tall to match a 1D barcode's own shape instead of a
          // square QR-sized box — easier to frame and a smaller region for
          // the decoder to search.
          qrbox: { width: 280, height: 150 },
          aspectRatio: 1.0,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128
          ]
        };

        // Reuse the camera list fetched on the first start (e.g. when the
        // user taps "Cambiar cámara") instead of re-prompting for permission.
        const getCamerasPromise = camerasRef.current.length
          ? Promise.resolve(camerasRef.current)
          : Html5Qrcode.getCameras();

        getCamerasPromise.then(devices => {
          if (devices && devices.length) {
            // Only reorder on the very first fetch of this scanner session —
            // camerasRef.current is empty then. A user-triggered "Cambiar
            // cámara" reuses the already-ordered list so cycling stays
            // predictable.
            const orderedDevices = camerasRef.current.length ? devices : sortCamerasForBarcodeScan(devices);
            camerasRef.current = orderedDevices;
            setCameraCount(orderedDevices.length);
            const selected = orderedDevices[activeCameraIndex] || orderedDevices[0];
            return html5QrCode.start(
              selected.id,
              {
                ...config,
                // Overrides the plain deviceId constraint built from the
                // first argument above with a fuller one: same exact
                // device, but also asking for more resolution and
                // continuous autofocus, both of which matter more than
                // raw zoom for actually decoding a close-up barcode.
                videoConstraints: {
                  deviceId: { exact: selected.id },
                  width: { ideal: 1920 },
                  height: { ideal: 1080 },
                  focusMode: { ideal: 'continuous' },
                },
              },
              onScanSuccess,
              () => { }
            );
          } else {
            throw new Error("No se detectaron cámaras.");
          }
        })
          .then(() => {
            scannerIsRunningRef.current = true;
            // When the running camera exposes optical/digital zoom, nudge
            // it in by default (past the halfway point) and expose a
            // slider so the user can fine-tune — on top of picking the
            // main lens and requesting continuous autofocus above, this
            // gets a close-up barcode to fill more of the frame.
            try {
              const zoom = html5QrCode.getRunningTrackCameraCapabilities().zoomFeature();
              if (zoom.isSupported()) {
                const min = zoom.min();
                const max = zoom.max();
                const step = zoom.step() || 0.1;
                const current = zoom.value();
                const suggested = Math.min(max, min + (max - min) * 0.5);
                const initial = current && current > min ? current : suggested;
                zoomFeatureRef.current = zoom;
                setZoomInfo({ min, max, step, value: initial });
                if (initial !== current) {
                  zoom.apply(initial).catch(() => { });
                }
              } else {
                setZoomInfo(null);
              }
            } catch (e) {
              setZoomInfo(null);
            }
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
  }, [showScanner, activeCameraIndex, onScanSuccess]);

  // The supermarket whose categories are currently "active": the
  // GPS-detected one when it's Carrefour or ChangoMas, otherwise Carrefour
  // as the default — so there's always exactly one brand's category set in
  // use, never a mix of both and never neither.
  const activeBrandKey = (detectedSupermarket && MAPPED_BRANDS.includes(detectedSupermarket.brandKey))
    ? detectedSupermarket.brandKey
    : CATEGORY_BRANDS.CARREFOUR;

  // Only the active brand's own main categories (+ Otros) — both for the
  // filter ribbon and the add/edit product picker, so exactly one
  // supermarket's categories show at a time.
  const activeCategories = useMemo(() => {
    const brandIds = new Set(getCategorySetForBrand(activeBrandKey).map(c => c.id));
    const fromSaved = categories.filter(c => brandIds.has(c.id));
    return fromSaved.length > 0 ? fromSaved : categories;
  }, [categories, activeBrandKey]);

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
              <div ref={scrollCollapseSentinelRef} className="scroll-collapse-sentinel" aria-hidden="true"></div>
              <div className={`list-header ${isListHeaderCollapsed ? 'list-header--collapsed' : ''}`}>
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
                    <ShoppingBag size={22} strokeWidth={2.2} />
                  </div>
                </div>

                <div className="category-tabs-wrapper">
                  <CategoryFilter
                    categories={activeCategories}
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
                    icon={<MapPin size={20} />}
                    className="explore-super-button btn-square"
                    title="Explorar Precios"
                  >
                    Precios
                  </Button>
                  <Button
                    onClick={() => navigate('/comparar')}
                    variant="secondary"
                    icon={<BarChart2 size={20} />}
                    className="compare-button btn-square"
                    title="Comparar Precios"
                  >
                    Comparar
                  </Button>
                  <Button
                    onClick={handleToggleForm}
                    variant="primary"
                    icon={<Plus size={20} />}
                    className="toggle-form-button btn-square"
                  >
                    Agregar
                  </Button>
                  <Button
                    onClick={() => setShowScanner(true)}
                    variant="secondary"
                    icon={<ScanBarcode size={20} />}
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
                  categories={activeCategories}
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
              {zoomInfo && (
                <div className="scanner-zoom-control">
                  <span>Zoom</span>
                  <input
                    type="range"
                    min={zoomInfo.min}
                    max={zoomInfo.max}
                    step={zoomInfo.step}
                    value={zoomInfo.value}
                    onChange={handleZoomChange}
                    aria-label="Zoom de la cámara"
                  />
                </div>
              )}
              <div className="scanner-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button onClick={handleCloseScanner} variant="secondary">
                  Cerrar Escáner
                </Button>
                {cameraCount > 1 && (
                  <Button onClick={handleSwitchCamera} variant="secondary">
                    Cambiar cámara
                  </Button>
                )}
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
        <span className="loading-auth-title">SuperLista</span>
        <div className="loading-auth-spinner"></div>
      </div>
    );
  }

  const routeFallback = (
    <div className="loading-auth" role="status" aria-label="Cargando">
      <img src="/logo.svg" alt="" className="loading-auth-icon" />
      <span className="loading-auth-title">SuperLista</span>
      <div className="loading-auth-spinner"></div>
    </div>
  );

  return (
    <Suspense fallback={routeFallback}>
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
    </Suspense>
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