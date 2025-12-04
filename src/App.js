// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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
import Select from './components/Select/Select';
import Supermercados from './components/supermercados/Supermercados';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { showErrorAlert, showSuccessToast } from './Notifications/NotificationsServices';

// Import local product data for scanner lookup
import carrefourDefaultProducts from './data/products/carrefour/1.json';
import diaDefaultProducts from './data/products/dia/87.json';
import changomasDefaultProducts from './data/products/changomas/1004.json';

// Importa tus estilos
import './App.css';
import './components/header/Header.css';
import './components/Input/Input.css';
import './components/Select/Select.css';
import './TotalSummary/TotalSummary.css';
import './components/Buttons/Button.css';

const LOCAL_BRAND_DEFAULT_PRODUCTS_MAP = {
  carrefour: carrefourDefaultProducts,
  dia: diaDefaultProducts,
  changomas: changomasDefaultProducts,
};

function MainAppContent() {
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

  // Scanner states
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef(null);
  const scannerIsRunningRef = useRef(false);

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

    // Search for the product in all local data
    let foundProduct = null;
    for (const products of Object.values(LOCAL_BRAND_DEFAULT_PRODUCTS_MAP)) {
      foundProduct = products.find(p => {
        // ID format usually: "EAN-BranchID" or "PaddedEAN-BranchID"
        const idParts = p.id.split('-');
        if (idParts.length > 0) {
          const idCodePart = idParts[0]; // Get the EAN part
          const normalizedIdCode = normalizeCode(idCodePart);
          return normalizedIdCode === normalizedScannedCode;
        }
        return false;
      });
      if (foundProduct) break;
    }

    if (foundProduct) {
      // Set the found product as the "editing" product (but without firebaseId, so it's treated as new)
      setEditingProduct({
        nombre: foundProduct.nombre,
        valor: foundProduct.precio || '',
        cantidad: 1,
        // We don't have category mapping here easily, so we let ProductForm handle default/fallback
      });
      setShowProductForm(true);
      showSuccessToast(`Producto encontrado: ${foundProduct.nombre}`);
    } else {
      showErrorAlert('Producto no encontrado', `No se encontró información para el código: ${decodedText}. Puedes ingresarlo manualmente.`);
    }
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
                  <strong>Lista Actual: </strong>
                  {currentListName || 'Cargando...'}
                </h3>
                <h4>
                  Total de Productos:{' '}
                  <span dangerouslySetInnerHTML={{ __html: totalProductos || '<em style="font-weight: lighter;">Sin Productos</em>' }}></span>
                </h4>

                <div style={{ width: '100%', marginTop: '10px' }}>
                  <Select
                    id="category-filter"
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    options={[
                      { value: '', label: '📂 Todas las Categorías' },
                      ...categories.map(cat => ({
                        value: cat.id,
                        label: `${cat.icon} ${cat.title}`
                      }))
                    ]}
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

        {currentListId && (
          <div className="fixed-bottom-controls">
            <div className="bottom-controls-header">
              <SearchBar
                busqueda={searchTerm}
                setBusqueda={setSearchTerm}
              />
              <Button
                onClick={handleToggleForm}
                variant={showProductForm ? 'secondary' : 'primary'}
                icon={showProductForm ? '❌' : '➕'}
                className="toggle-form-button"
              >
                {showProductForm ? 'Cancelar' : 'Agregar Producto'}
              </Button>
              <Button
                onClick={() => setShowScanner(true)}
                variant="secondary"
                icon="📷"
                className="scan-product-button"
                style={{ marginTop: '10px' }}
              >
                Escanear Producto
              </Button>
              <TotalSummary total={totalGeneral} />
            </div>

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