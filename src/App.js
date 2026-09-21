// src/App.js
import React, { useState, useEffect, useMemo, useCallback, Suspense, lazy } from 'react';
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
import ScannerView from './components/BarcodeScanner/ScannerView';
import CategoryFilter from './components/CategoryFilter/CategoryFilter';
import { ProductListSkeleton } from './components/Skeleton/Skeleton';

import useBarcodeScanner from './hooks/useBarcodeScanner';
import { ShoppingBag, MapPin, BarChart2, Plus, ScanBarcode, ExternalLink } from 'lucide-react';
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

const SUPERMARKET_LOGO_BRANDS = ['carrefour', 'changomas', 'coto', 'dia', 'easy', 'jumbo', 'vea'];
const getSupermarketLogoUrl = (brandKey) => (
  SUPERMARKET_LOGO_BRANDS.includes(brandKey) ? `/logo_super/display/logo_${brandKey}.png` : null
);

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
  // summary banner) once the user has scrolled down the product list;
  // expands again when they come back to the top.
  const { isCollapsed: isListHeaderCollapsed, sentinelRef: scrollCollapseSentinelRef } = useScrollCollapse();

  // GPS State
  const [detectedSupermarket, setDetectedSupermarket] = useState(null);

  // Scanner states
  const [showScanner, setShowScanner] = useState(false);

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
            const logoUrl = getSupermarketLogoUrl(nearestStore.brandKey);
            const placeHtml = logoUrl
              ? `<img src="${logoUrl}" alt="${nearestStore.name}" style="height:28px;max-width:120px;object-fit:contain;" />`
              : `<strong>${nearestStore.name}</strong>`;
            showSuccessToast(
              `<span style="display:inline-flex;align-items:center;gap:8px;">Estás en: ${placeHtml}</span>`
            );
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

  useBarcodeScanner(showScanner, onScanSuccess, (err) => {
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

  const listHeaderContent = (
    <>
      <div className="list-summary-banner">
        <div className="list-summary-content">
          {totalAhorro > 0 && (
            <span className="list-summary-savings">
              ⚡ Ahorrás {totalAhorro.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })} esta semana
            </span>
          )}
          <div className="list-summary-meta-row">
            <div className="list-summary-meta">
              {currentListName || 'Cargando...'} · {totalProductos || 0} producto{totalProductos === 1 ? '' : 's'}
            </div>
            <div className="list-summary-icon">
              <ShoppingBag size={18} strokeWidth={2.2} />
            </div>
          </div>
          <div className="list-summary-total">{formattedTotal}</div>
        </div>
        {detectedSupermarket && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${detectedSupermarket.branchData.latitud},${detectedSupermarket.branchData.longitud}`}
            target="_blank"
            rel="noopener noreferrer"
            className="detected-super-link"
            title={`Ver ${detectedSupermarket.name} en el mapa`}
          >
            <span className="detected-super-label">Estás en:</span>
            {getSupermarketLogoUrl(detectedSupermarket.brandKey) ? (
              <img
                src={getSupermarketLogoUrl(detectedSupermarket.brandKey)}
                alt={detectedSupermarket.name}
                className="detected-super-logo"
              />
            ) : (
              <span className="detected-super-name">{detectedSupermarket.name}</span>
            )}
            <ExternalLink size={12} />
          </a>
        )}
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
    </>
  );

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
              {/* The slot reserves the header's fully-expanded height through an
                  invisible copy, while the visible header is absolutely
                  positioned on top of it. That way it can collapse/expand
                  with its own animation without ever changing the layout
                  (and scroll position) of the list below. */}
              <div className="list-header-slot">
                <div className="list-header list-header--ghost" aria-hidden="true">
                  {listHeaderContent}
                </div>
                <div className={`list-header ${isListHeaderCollapsed ? 'list-header--collapsed' : ''}`}>
                  {listHeaderContent}
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
          <ScannerView>
            <Button onClick={handleCloseScanner} variant="secondary">
              Cerrar Escáner
            </Button>
          </ScannerView>
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