// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import { useAuth, AuthProvider } from './context/AuthContext';
import { subscribeToCategories } from './services/firebaseService';
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
import TotalSummary from './TotalSummary/TotalSummary';
import Button from './components/Buttons/Button';
import CategoryFilter from './components/CategoryFilter/CategoryFilter';
import Supermercados from './components/supermercados/Supermercados';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { showErrorAlert, showSuccessToast } from './Notifications/NotificationsServices';

// Import local product data for scanner lookup
// Unused import removed


// Importa tus estilos
import './App.css';
import './components/header/Header.css';
import './components/Input/Input.css';
import './components/Select/Select.css';
import './TotalSummary/TotalSummary.css';
import './components/Buttons/Button.css';

const LOCAL_BRANDS_LOCATION_DATA = {}; // Loaded dynamically

const LOCAL_BRAND_DEFAULT_BRANCH_IDS = {
  carrefour: '1',
  dia: '87',
  changomas: '1004',
};

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
            if (!response.ok) return [];
            const branches = await response.json();

            const targetBranchId = LOCAL_BRAND_DEFAULT_BRANCH_IDS[brandId];
            const branch = branches.find(b => String(b.id_sucursal) === String(targetBranchId));

            if (branch && branch.latitud && branch.longitud) {
              const distance = getDistanceFromLatLonInKm(latitude, longitude, branch.latitud, branch.longitud);
              if (distance < THRESHOLD_KM) {
                return {
                  brandKey: brandId,
                  name: branch.marca || branch.comercio_bandera_nombre || brandId,
                  branchData: branch,
                  distance: distance
                };
              }
            }
          } catch (e) { }
          return null;
        })).then(foundBranches => {
          const validBranches = foundBranches.filter(b => b !== null).sort((a, b) => a.distance - b.distance);
          if (validBranches.length > 0) {
            const nearestBranch = validBranches[0];
            setDetectedSupermarket(nearestBranch);
            showSuccessToast(`📍 Estás en ${nearestBranch.name}`);
          }
        });

      }, (error) => {
        console.warn("Error obteniendo ubicación:", error);
        if (error.code === 1) {
          showErrorAlert("Permiso GPS Denegado", "Por favor habilita el GPS para detectar el supermercado cercano.");
        }
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

  const onScanSuccess = (decodedText, decodedResult) => {
    console.log(`Code scanned = ${decodedText}`, decodedResult);

    // Stop scanning
    setShowScanner(false);

    const normalizedScannedCode = normalizeCode(decodedText);
    console.log(`Normalized scanned code: ${normalizedScannedCode}`);

    // Search for the product in brand CSVs
    const brandIds = detectedSupermarket
      ? [detectedSupermarket.brandKey]
      : ['carrefour', 'dia', 'changomas', 'jumbo', 'vea', 'vital', 'easy'];

    Promise.all(brandIds.map(async (brandId) => {
      try {
        const branchId = (detectedSupermarket && detectedSupermarket.brandKey === brandId)
          ? detectedSupermarket.branchData.id_sucursal
          : LOCAL_BRAND_DEFAULT_BRANCH_IDS[brandId];

        if (!branchId) return null;

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
    })).then(results => {
      const foundProduct = results.find(r => r !== null);
      if (foundProduct) {
        setEditingProduct({
          nombre: foundProduct.nombre,
          valor: foundProduct.precio || '',
          cantidad: 1,
        });
        setShowProductForm(true);
        showSuccessToast(`Producto encontrado: ${foundProduct.nombre}`);
      } else {
        showErrorAlert('Producto no encontrado', `No se encontró información para el código: ${decodedText}.`);
      }
    });
  };

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
  }, [showScanner]);

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
            <p className="loading-message">Cargando tus listas...</p>
          ) : currentListId ? (
            <>
              <div className="list-header">
                <h3 className="current-list-title">
                  {currentListName || 'Cargando...'}
                </h3>
                {/* Detected supermarket moved to header stats */}

                <div className="list-header-stats">
                  <span className="stat-item">
                    <span>Productos: </span>
                    <span dangerouslySetInnerHTML={{ __html: totalProductos || '<em style="font-weight: lighter;">Vacío</em>' }}></span>

                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    {detectedSupermarket && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${detectedSupermarket.branchData.latitud},${detectedSupermarket.branchData.longitud}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '0.75rem', color: '#4caf50', marginBottom: '0px', textAlign: 'right', fontWeight: '500', textDecoration: 'none', cursor: 'pointer' }}
                      >
                        📍 {detectedSupermarket.name}
                        {' '}<span style={{ fontSize: '0.7rem' }}>↗️</span>
                      </a>
                    )}
                    <span className="stat-item total-amount">
                      <span>Total: </span>
                      {formattedTotal}
                    </span>
                  </div>
                </div>

                <div className="category-tabs-wrapper" style={{ width: '100%', overflow: 'hidden' }}>
                  <CategoryFilter
                    categories={categories}
                    selectedCategoryId={selectedCategoryId}
                    onSelectCategory={setSelectedCategoryId}
                  />
                </div>
              </div>
              {loadingProducts ? (
                <p className="loading-message">Cargando productos...</p>
              ) : (
                <ProductList
                  productos={filteredProducts}
                  busqueda={searchTerm}
                  onEditar={handleStartEditing}
                />
              )}
            </>
          ) : (
            <div className="empty-state card">
              <div className="empty-icon">📂</div>
              <h3 className="empty-title">Crea o selecciona una lista</h3>
              <p className="empty-description">Usa el botón de menú (☰) en la esquina superior derecha para gestionar tus listas.</p>
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
                  categories={categories}
                  onScan={() => setShowScanner(true)}
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
    return <div className="loading-auth">Cargando autenticación...</div>;
  }

  return (
    <Routes>
      <Route path="/auth" element={currentUser ? <Navigate to="/" /> : <AuthPage />} />
      {/* Ruta para la aplicación principal (tus listas) */}
      <Route path="/" element={currentUser ? <MainAppContent /> : <Navigate to="/auth" />} />
      {/* NUEVA RUTA PARA SUPERMERCADOS */}
      <Route path="/supermercados" element={currentUser ? <Supermercados /> : <Navigate to="/auth" />} />
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