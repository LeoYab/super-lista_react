import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import './Supermercados.css';
import Input from '../Input/Input';
import Button from '../Buttons/Button';
import SupermarketProductItem from './SupermarketProductItem/SupermarketProductItem';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useProductsContext } from '../../context/ProductsContext';
import { useUserListsContext } from '../../context/UserListsContext';
import { subscribeToCategories } from '../../services/firebaseService';
import { showErrorAlert } from '../../Notifications/NotificationsServices';






// Removed unused fetchCSV import


// Unused maps removed


const LOCAL_BRAND_DEFAULT_BRANCH_IDS = {
  dia: '87',
  changomas: '1004',
  carrefour: '1',
  easy: '101',
  coto: '101',
  jumbo: '121',
  vea: '1'
}

const PRODUCTS_PER_PAGE = 20;

const Supermercados = () => {
  const navigate = useNavigate();
  const [selectedBrand, setSelectedBrand] = useState(null);

  const [selectedBranch, setSelectedBranch] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [productsToDisplay, setProductsToDisplay] = useState([]);

  const lastVisibleProductRef = useRef(null);
  const allLocalProductsLoadedRef = useRef([]);
  const filteredLocalProductsRef = useRef([]);
  const localPaginationIndexRef = useRef(0);
  const isFetchingRef = useRef(false); // Ref para controlar la carga activa de fetchProductsData

  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingBrands, setIsLoadingBrands] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false); // Estado para la UI
  const [allBrandsFirebase, setAllBrandsFirebase] = useState([]);
  const [availableBranches, setAvailableBranches] = useState([]);
  const [branchSearchTerm, setBranchSearchTerm] = useState('');
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  // Unused state removed

  const [dataSource, setDataSource] = useState('Firestore');
  const [error, setError] = useState(null);

  // Scanner states
  const [showScanner, setShowScanner] = useState(false);
  const [scannedProducts, setScannedProducts] = useState([]);
  const scannerRef = useRef(null);
  const scannerIsRunningRef = useRef(false);

  const { addProduct } = useProductsContext();
  const { currentListId } = useUserListsContext();
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeToCategories((loadedCategories) => {
      setCategories(loadedCategories);
    });
    return () => unsubscribe();
  }, []);

  const handleAddProductToUserList = useCallback((product) => {
    if (!currentListId) {
      showErrorAlert('No hay lista seleccionada', 'Por favor, selecciona o crea una lista primero.');
      return;
    }

    // Buscar categoría "Otros" o usar fallback
    const defaultCategory = categories.find(cat => cat.title.toLowerCase() === 'otros') ||
      categories[0] ||
      { id: 'otros', icon: '🛒' };

    const productData = {
      nombre: product.nombre,
      valor: product.precio,
      cantidad: 1,
      category: defaultCategory.id,
      icon: defaultCategory.icon
    };

    addProduct(productData);
  }, [addProduct, categories, currentListId]);


  // Unused helper removed


  useEffect(() => {
    const fetchAllBrands = async () => {
      setIsLoadingBrands(true);
      setError(null);
      try {
        console.log("Cargando marcas de supermercados desde public/data...");
        const response = await fetch('/data/supermarkets_list.json');

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const localBrands = await response.json();

        setAllBrandsFirebase(localBrands.map(brand => ({
          ...brand,
          id: brand.id,
          logo: `logo_super/logo_${brand.id}.png`,
        })));
        setDataSource('Local (Marcas - Public)');
      } catch (err) {
        console.error("Error loading brands:", err);
        setError("Error al cargar las marcas de supermercados.");
      } finally {
        setIsLoadingBrands(false);
      }
    };
    fetchAllBrands();
  }, []);

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radio de la tierra en km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distancia en km
    return d;
  };

  // GPS logic integrated into fetchAndSetBranch

  const fetchAndSetBranch = useCallback(async (brand) => {
    // No setear isLoadingProducts aquí, déjalo para fetchProductsData
    allLocalProductsLoadedRef.current = [];
    filteredLocalProductsRef.current = [];
    localPaginationIndexRef.current = 0;
    lastVisibleProductRef.current = null;
    setProductsToDisplay([]);
    setSearchTerm('');
    setBranchSearchTerm(''); // Reset branch search
    setError(null);
    setIsSearching(false);

    let branchToSet = null;

    try {
      const safeBrandId = brand.id.toLowerCase();
      const url = `/data/super/${safeBrandId}.json`;
      console.log(`Intentando cargar sucursales desde: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        console.error(`Error al cargar ${url}: ${response.status} ${response.statusText}`);
        throw new Error("Local branch data not found");
      }

      let localBranchesList = await response.json();
      console.log(`Sucursales cargadas para ${brand.id}: ${localBranchesList.length}`);

      // INTEGRACIÓN GPS: Obtener ubicación y calcular distancias
      try {
        if (navigator.geolocation) {
          console.log("Solicitando ubicación del usuario para ordenar sucursales...");
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
          });

          const { latitude, longitude } = position.coords;
          console.log(`Ubicación obtenida: ${latitude}, ${longitude}`);

          // Calcular distancia para cada sucursal y añadirla al objeto
          localBranchesList = localBranchesList.map(branch => {
            let dist = Infinity;
            if (branch.latitud && branch.longitud) {
              dist = getDistance(latitude, longitude, parseFloat(branch.latitud), parseFloat(branch.longitud));
            }
            return { ...branch, distance: dist }; // Añadir propiedad distance
          });

          // ORDENAR sucursales por distancia (menor a mayor)
          localBranchesList.sort((a, b) => a.distance - b.distance);
          console.log("Sucursales ordenadas por proximidad.");

        } else {
          console.log("Geolocalización no soportada por el navegador.");
        }
      } catch (gpsError) {
        console.warn("No se pudo obtener la ubicación o el usuario denegó el permiso. Se usará el orden por defecto.", gpsError);
        // Si falla el GPS, iteramos sin ordenar o mantener el orden original, 
        // pero aseguramos que la propiedad distance exista aunque sea null/Infinity para evitar errores UI
        localBranchesList = localBranchesList.map(b => ({ ...b, distance: null }));
      }

      setAvailableBranches(localBranchesList);

      // SELECCIÓN AUTOMÁTICA: Elegir la primera (la más cercana tras ordenar)
      if (localBranchesList.length > 0) {
        branchToSet = localBranchesList[0];
        console.log(`Sucursal seleccionada automáticamente (la más cercana): ${branchToSet.nombre_sucursal} (${branchToSet.distance ? branchToSet.distance.toFixed(1) + ' km' : 'distancia desc.'})`);
      } else {
        branchToSet = null;
      }

    } catch (err) {
      console.warn("Error fetching specific branch data:", err);
    } finally {
      setSelectedBranch(branchToSet);
    }
  }, []);

  const applySearchFilter = useCallback((products, term) => {
    console.log("Aplicando filtro. Productos recibidos:", products.length, "Término:", term);
    if (!term.trim()) {
      console.log("Término vacío, no se aplica filtro.");
      return [];
    }
    // CAMBIO: Para búsqueda local, el término se mantiene como está para la RegExp.
    // La conversión a mayúsculas es solo para Firestore.
    const escapedSearchTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegExp = new RegExp(escapedSearchTerm, 'i'); // 'i' para case-insensitive

    const filtered = products.filter(p =>
      searchRegExp.test(p.nombre) ||
      (p.marca_producto && searchRegExp.test(p.marca_producto))
    );
    console.log("Productos filtrados:", filtered.length);
    return filtered;
  }, []);

  const fetchProductsData = useCallback(async (brandId, branchId, initialLoad = true, searchModeParam = false, searchTermValueParam = '') => {
    console.log(`--- Iniciando fetchProductsData (SRC Method) ---`);
    console.log(`Debug - isLoadingProducts (antes de la guardia): ${isLoadingProducts}`);
    console.log(`Debug - isFetchingRef.current (antes de la guardia): ${isFetchingRef.current}`);
    console.log(`Brand ID: ${brandId}, Branch ID: ${branchId}, Initial Load: ${initialLoad}, Search Mode Param: ${searchModeParam}, Search Term Param: "${searchTermValueParam}"`);

    // Guardia con useRef para evitar llamadas redundantes asíncronas
    if (isFetchingRef.current) {
      console.log("Abortando fetchProductsData: Una operación de carga ya está en curso (isFetchingRef).");
      return;
    }

    if (!brandId || !branchId) {
      console.log("Abortando fetchProductsData: IDs de marca o sucursal inválidos.");
      return;
    }

    // Setear useRef y estado de carga para la UI
    isFetchingRef.current = true;
    setIsLoadingProducts(true);
    setError(null);
    let loadedProductsChunk = [];
    let currentDataSourceUsed = 'Firestore';

    try {
      currentDataSourceUsed = 'Local (Productos - Public)';
      console.log(`Cargando productos para ${brandId}/${branchId} desde archivos locales (public)...`);

      if (initialLoad || (isSearching && filteredLocalProductsRef.current.length === 0) || (!isSearching && allLocalProductsLoadedRef.current.length === 0)) {
        try {
          const jsonUrl = `/data/products/${brandId.toLowerCase()}/${branchId}.json`;

          const response = await fetch(jsonUrl);

          if (!response.ok) {
            throw new Error(`Failed to fetch ${jsonUrl} (Status: ${response.status})`);
          }

          const allBranchProducts = await response.json();

          allLocalProductsLoadedRef.current = allBranchProducts.map(p => ({
            ...p,
            supermercado_marca: selectedBrand?.nombre || brandId.charAt(0).toUpperCase() + brandId.slice(1),
            sucursal_nombre: selectedBranch?.nombre_sucursal || 'Desconocida'
          }));

          console.log(`Local: Se cargaron ${allLocalProductsLoadedRef.current.length} productos para la sucursal ${branchId} desde ${jsonUrl}.`);
        } catch (localError) {
          console.error(`Error al cargar productos locales para ${brandId}/${branchId}:`, localError);
          setError("Error: No se pudieron cargar productos. (Archivo de sucursal no encontrado)");
          allLocalProductsLoadedRef.current = [];
          setHasMoreProducts(false);
          isFetchingRef.current = false;
          setIsLoadingProducts(false);
          return;
        }
      }

      let productsToWorkWith;
      if (searchModeParam && searchTermValueParam) {
        productsToWorkWith = applySearchFilter(allLocalProductsLoadedRef.current, searchTermValueParam);
        filteredLocalProductsRef.current = productsToWorkWith;
        localPaginationIndexRef.current = 0;
        console.log(`Local: Filtrados ${filteredLocalProductsRef.current.length} productos para búsqueda: "${searchTermValueParam}"`);
      } else {
        productsToWorkWith = allLocalProductsLoadedRef.current;
        filteredLocalProductsRef.current = [];
        if (initialLoad) {
          localPaginationIndexRef.current = 0;
        }
      }

      const startIndex = localPaginationIndexRef.current;
      const endIndex = startIndex + PRODUCTS_PER_PAGE;
      loadedProductsChunk = productsToWorkWith.slice(startIndex, endIndex);

      localPaginationIndexRef.current = endIndex;

      setHasMoreProducts(endIndex < productsToWorkWith.length);

      setProductsToDisplay(prevProducts => {
        let newProducts;
        if (initialLoad || searchModeParam) {
          newProducts = loadedProductsChunk;
        } else {
          const newProductIds = new Set(loadedProductsChunk.map(p => p.id));
          const filteredPrevProducts = prevProducts.filter(p => !newProductIds.has(p.id));
          newProducts = [...filteredPrevProducts, ...loadedProductsChunk];
        }
        return newProducts;
      });
      setDataSource(currentDataSourceUsed);

    } catch (error) {
      console.error(`Error general al cargar productos para ${brandId}/${branchId}:`, error);
      setError(`Error al cargar productos: ${error.message}.`);
      setProductsToDisplay([]);
      setHasMoreProducts(false);
    } finally {
      isFetchingRef.current = false;
      setIsLoadingProducts(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrand, selectedBranch, dataSource, applySearchFilter]);

  // Este useEffect para selectedBrand solo debería llamar a fetchAndSetBranch
  useEffect(() => {
    console.log("useEffect [selectedBrand]: selectedBrand ha cambiado.");
    if (selectedBrand) {
      console.log("Debug - Marca seleccionada. Iniciando búsqueda de sucursal.");
      fetchAndSetBranch(selectedBrand);
    } else {
      setSelectedBranch(null);
      setProductsToDisplay([]);
      allLocalProductsLoadedRef.current = [];
      filteredLocalProductsRef.current = [];
      localPaginationIndexRef.current = 0;
      setIsLoadingProducts(false);
      lastVisibleProductRef.current = null;
      setHasMoreProducts(true);
      setIsSearching(false);
      setSearchTerm('');
      setError(null);
      console.log("Debug - selectedBrand es null, estados limpios.");
    }
  }, [selectedBrand, fetchAndSetBranch]);

  // Este useEffect para selectedBranch solo debería disparar la carga inicial de productos
  useEffect(() => {
    console.log("useEffect [selectedBranch]: selectedBranch ha cambiado.");
    if (selectedBranch && selectedBrand) {
      if (!selectedBranch.id_sucursal) {
        console.warn("Debug - selectedBranch.id_sucursal vacío o inválido. Abortando carga.");
        setError("Error: Sucursal seleccionada inválida.");
        return;
      }

      console.log("Debug - Sucursal y Marca seleccionadas. Se espera la búsqueda para cargar productos.");
      // Reiniciar estados relevantes para una nueva selección de sucursal
      setProductsToDisplay([]);
      lastVisibleProductRef.current = null;
      localPaginationIndexRef.current = 0;
      filteredLocalProductsRef.current = [];
      setHasMoreProducts(true);
      setIsSearching(false); // Asegúrate de que no esté en modo búsqueda al cambiar de sucursal
      setSearchTerm(''); // Limpiar término de búsqueda al cambiar de sucursal
      allLocalProductsLoadedRef.current = []; // Limpiar caché de productos locales

      // CAMBIO: NO llamar a fetchProductsData aquí para evitar la carga inicial automática
      // fetchProductsData(selectedBrand.id, selectedBranch.id_sucursal, true, false, '');

    } else if (!selectedBranch && selectedBrand) {
      setProductsToDisplay([]);
      allLocalProductsLoadedRef.current = [];
      filteredLocalProductsRef.current = [];
      localPaginationIndexRef.current = 0;
      setIsLoadingProducts(false);
      lastVisibleProductRef.current = null;
      setHasMoreProducts(true);
      setIsSearching(false);
      setSearchTerm('');
      setError("No se pudo encontrar una sucursal para la marca seleccionada.");
      console.log("Debug - selectedBranch es null pero selectedBrand está. Mostrar error.");
    } else if (!selectedBrand && !selectedBranch) {
      setProductsToDisplay([]);
      allLocalProductsLoadedRef.current = [];
      filteredLocalProductsRef.current = [];
      localPaginationIndexRef.current = 0;
      setIsLoadingProducts(false);
      lastVisibleProductRef.current = null;
      setHasMoreProducts(true);
      setIsSearching(false);
      setSearchTerm('');
      setError(null);
      console.log("Debug - Ni selectedBrand ni selectedBranch, estados limpios.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch, selectedBrand]); // Eliminada fetchProductsData de las dependencias ya que no se llama directamente

  const handleSelectBrand = (brand) => {
    console.log(`handleSelectBrand: Marca seleccionada: ${brand.nombre}`);
    setSelectedBrand(brand);
  };

  const handleSearch = () => {
    console.log(`handleSearch: Término: "${searchTerm}"`);
    if (!selectedBranch) {
      setProductsToDisplay([]);
      setError("Selecciona una sucursal para buscar productos.");
      console.log("handleSearch: No hay sucursal seleccionada. Abortando búsqueda.");
      return;
    }

    const term = searchTerm.trim();
    if (!term) {
      console.log("handleSearch: Término de búsqueda vacío. Volviendo a la carga normal (lista vacía).");
      setIsSearching(false);
      setProductsToDisplay([]); // Limpiar y dejar vacío si no hay término
      lastVisibleProductRef.current = null;
      localPaginationIndexRef.current = 0;
      filteredLocalProductsRef.current = [];
      setHasMoreProducts(true);
      setError(null);
      // CAMBIO: No llamar a fetchProductsData, solo limpiar la lista
      return;
    }

    // Antes de iniciar una nueva búsqueda, reiniciamos todos los estados de paginación/productos
    setError(null);
    setIsSearching(true);
    setProductsToDisplay([]);
    lastVisibleProductRef.current = null;
    localPaginationIndexRef.current = 0;
    filteredLocalProductsRef.current = [];
    setHasMoreProducts(true);

    // Disparar la búsqueda con el término actual
    fetchProductsData(selectedBrand.id, selectedBranch.id_sucursal, true, true, term);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleLoadMore = () => {
    console.log(`handleLoadMore: Intentando cargar más. isLoadingProducts: ${isLoadingProducts}, hasMoreProducts: ${hasMoreProducts}`);
    // CAMBIO: Usar isFetchingRef.current para la guardia más estricta
    if (!isFetchingRef.current && hasMoreProducts && selectedBrand && selectedBranch) {
      fetchProductsData(selectedBrand.id, selectedBranch.id_sucursal, false, isSearching, searchTerm.trim());
    } else if (!hasMoreProducts) {
      console.log("handleLoadMore: Ya no hay más productos para cargar.");
    } else if (isFetchingRef.current) { // CAMBIO: Usar isFetchingRef.current aquí
      console.log("handleLoadMore: Ya se está cargando, esperando...");
    } else if (!selectedBrand || !selectedBranch) {
      console.log("handleLoadMore: No hay marca o sucursal seleccionada.");
    }
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

    // Search for the product in brand CSVs
    const brandIds = ['carrefour', 'dia', 'changomas', 'jumbo', 'vea', 'vital', 'easy'];

    Promise.all(brandIds.map(async (brandId) => {
      try {
        const branchId = LOCAL_BRAND_DEFAULT_BRANCH_IDS[brandId];
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

        if (found) {
          return {
            ...found,
            supermercado_marca: brandId.charAt(0).toUpperCase() + brandId.slice(1),
            sucursal_nombre: 'Sucursal Local'
          };
        }
      } catch (e) { }
      return null;
    })).then(foundResults => {
      const results = foundResults.filter(r => r !== null);
      setScannedProducts(results);
      if (results.length === 0) {
        alert(`No se encontraron productos con el código: ${decodedText}`);
      }
    });
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const html5QrCode = scannerRef.current;
    if (!html5QrCode) return;

    try {
      // Stop camera if running to free up the UI element for the image
      try {
        await html5QrCode.stop();
        html5QrCode.clear();
      } catch (err) {
        console.log("Scanner was not running or failed to stop", err);
      }

      const decodedText = await html5QrCode.scanFileV2(file, true);
      onScanSuccess(decodedText.decodedText, decodedText);
    } catch (err) {
      console.error("Error scanning file:", err);
      alert("No se pudo detectar un código de barras en la imagen. Intenta con una imagen más clara.");
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

        const config = {
          fps: 10,
          qrbox: { width: 300, height: 150 }, // Rectangular for barcodes
          aspectRatio: 1.0,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128
          ]
        };

        // Intentar obtener cámaras primero para diagnósticos más precisos
        Html5Qrcode.getCameras().then(devices => {
          if (devices && devices.length) {
            // Si hay cámaras, intentamos iniciar con la configuración preferida
            return html5QrCode.start(
              { facingMode: "environment" },
              config,
              onScanSuccess,
              () => { }
            );
          } else {
            throw new Error("No se detectaron cámaras en el dispositivo.");
          }
        })
          .then(() => {
            scannerIsRunningRef.current = true;
          })
          .catch(err => {
            console.error("Error starting scanner:", err);
            let userMsg = `No se pudo iniciar la cámara.`;

            if (err.name === 'NotReadableError' || err.message?.includes('NotReadableError')) {
              userMsg = "La cámara parece estar en uso por otra aplicación (Zoom, Meet, etc.) o hay un fallo de hardware. Cierra otras apps y recarga.";
            } else if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
              userMsg = "Permiso denegado. Habilita el acceso a la cámara en el navegador.";
            } else if (err.name === 'NotFoundError') {
              userMsg = "No se encontró ninguna cámara.";
            } else {
              userMsg += ` Detalles: ${err.message || err}`;
            }

            alert(`${userMsg} (Asegúrate de usar HTTPS si no es localhost)`);
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
                console.log("Scanner stopped");
              } catch (err) {
                console.warn("Error stopping scanner (might not be running):", err);
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

  const handleCloseScanner = () => {
    setShowScanner(false);
    setScannedProducts([]);
  };

  const groupedProductsByBrand = useMemo(() => {
    const groups = new Map();
    productsToDisplay.forEach(product => {
      // Usar 'marca_producto' si existe, de lo contrario un valor por defecto
      const groupKey = product.marca_producto || 'Sin Marca';
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(product);
    });
    return Array.from(groups.entries());
  }, [productsToDisplay]);

  return (
    <div className="supermercados-container">
      <div className="supermercados-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Explorar Supermercados y Precios</h2>
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

      {/* Scanner Modal */}
      {showScanner && (
        <div className="scanner-modal-overlay">
          <div className="scanner-modal-content">
            <h3>Escanear Código de Barras</h3>
            <div id="reader" width="600px"></div>
            <div className="scanner-actions" style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <Button onClick={handleCloseScanner} variant="secondary">
                Cerrar Escáner
              </Button>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                id="scanner-file-input"
              />
              <Button
                onClick={() => document.getElementById('scanner-file-input').click()}
                variant="secondary"
              >
                Subir imagen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Scanned Results Modal/Overlay */}
      {scannedProducts.length > 0 && !showScanner && (
        <div className="scanner-modal-overlay">
          <div className="scanner-modal-content results-content">
            <h3>Productos Encontrados</h3>
            <div className="scanned-products-list">
              {scannedProducts.map((product, index) => (
                <div key={index} className="scanned-product-item">
                  <h4>{product.supermercado_marca}</h4>
                  <SupermarketProductItem
                    product={product}
                    onAddToList={handleAddProductToUserList}
                  />
                </div>
              ))}
            </div>
            <Button onClick={() => setScannedProducts([])} variant="primary" style={{ marginTop: '20px' }}>
              Cerrar Resultados
            </Button>
          </div>
        </div>
      )}

      <div className="supermarket-slider-wrapper">
        <h3>Selecciona un Supermercado:</h3>
        {isLoadingBrands ? (
          <p className="loading-message">Cargando marcas de supermercados...</p>
        ) : (
          <div className="supermarket-slider">
            {allBrandsFirebase.length > 0 ? (
              allBrandsFirebase.map(brand => (
                <div
                  key={brand.id}
                  className={`supermarket-card ${selectedBrand && selectedBrand.id === brand.id ? 'active' : ''}`}
                  onClick={() => handleSelectBrand(brand)}
                >
                  {brand.logo ? (
                    <img src={brand.logo} alt={brand.nombre} className="supermarket-logo" />
                  ) : (
                    <div className="supermarket-logo-placeholder">{brand.nombre.charAt(0).toUpperCase()}</div>
                  )}
                  <p className="supermarket-name">{brand.nombre}</p>
                </div>
              ))
            ) : (
              <p className="no-data-message">No se encontraron marcas de supermercados.</p>
            )}
          </div>
        )}
      </div>

      <div className="supermercados-content">
        <div className="supermercados-list">
          {selectedBrand ? (
            <>
              <div className="branch-selector-container" style={{ marginBottom: '15px' }}>
                <h3>
                  Precios en{' '}
                  {selectedBrand.nombre}
                </h3>

                {availableBranches.length > 0 && (
                  <div className="branch-selection-controls" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

                    <div className="custom-dropdown-container">
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Sucursal:</label>
                      <div
                        className="dropdown-trigger"
                        onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
                      >
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {selectedBranch ? (() => {
                            let label = selectedBranch.direccion_sucursal || selectedBranch.nombre_sucursal || `Sucursal ${selectedBranch.id_sucursal}`;
                            const idPrefixPattern = new RegExp(`^${selectedBranch.id_sucursal}\\s*[-–]?\\s*`, 'i');
                            label = label.replace(idPrefixPattern, '');
                            const distStr = (selectedBranch.distance !== undefined && selectedBranch.distance !== null && selectedBranch.distance !== Infinity)
                              ? ` (${selectedBranch.distance.toFixed(1)} km)`
                              : '';
                            return `${selectedBranch.id_sucursal} - ${label.toUpperCase()}${distStr}`;
                          })() : 'Seleccione una sucursal...'}
                        </span>
                        <span style={{ marginLeft: '10px' }}>▼</span>
                      </div>

                      {isBranchDropdownOpen && (
                        <div className="dropdown-menu">
                          <div className="dropdown-search-container">
                            <input
                              autoFocus
                              className="dropdown-search-input"
                              placeholder="🔍 Buscar sucursal..."
                              value={branchSearchTerm}
                              onChange={(e) => setBranchSearchTerm(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="dropdown-list">
                            {availableBranches
                              .filter(branch => {
                                if (!branchSearchTerm) return true;
                                const search = branchSearchTerm.toLowerCase();
                                const text = `${branch.id_sucursal} ${branch.direccion_sucursal || ''} ${branch.nombre_sucursal || ''}`.toLowerCase();
                                return text.includes(search);
                              })
                              .map((branch) => {
                                let label = branch.direccion_sucursal || branch.nombre_sucursal || `Sucursal ${branch.id_sucursal}`;
                                const idPrefixPattern = new RegExp(`^${branch.id_sucursal}\\s*[-–]?\\s*`, 'i');
                                label = label.replace(idPrefixPattern, '');

                                return (
                                  <div
                                    key={branch.id_sucursal}
                                    className="dropdown-item"
                                    onClick={() => {
                                      setSelectedBranch(branch);
                                      setIsBranchDropdownOpen(false);
                                      setBranchSearchTerm('');
                                    }}
                                  >
                                    <strong>{branch.id_sucursal}</strong> - {label.toUpperCase()}
                                    {branch.distance !== undefined && branch.distance !== null && branch.distance !== Infinity && (
                                      <span style={{ marginLeft: '8px', color: '#28a745', fontSize: '0.9em' }}>
                                        ({branch.distance.toFixed(1)} km)
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            {availableBranches.filter(branch => {
                              if (!branchSearchTerm) return true;
                              const search = branchSearchTerm.toLowerCase();
                              const text = `${branch.id_sucursal} ${branch.direccion_sucursal || ''} ${branch.nombre_sucursal || ''}`.toLowerCase();
                              return text.includes(search);
                            }).length === 0 && (
                                <div className="dropdown-item" style={{ cursor: 'default', color: '#999' }}>
                                  No se encontraron resultados
                                </div>
                              )}
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>

              {error && <p className="error-message">{error}</p>}
              <p className="data-source-info">Datos cargados desde: <strong>{dataSource}</strong></p>

              <div className="product-search-bar">
                <Input
                  id="busquedaSuper"
                  name="busquedaSuper"
                  type="text"
                  placeholder="Buscar productos por nombre o marca..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={!selectedBranch || isLoadingProducts}
                />
                <Button
                  onClick={handleSearch}
                  size="small"
                  variant="primary"
                  disabled={!selectedBranch || isLoadingProducts}
                >
                  Buscar
                </Button>
                <Button
                  onClick={() => setShowScanner(true)}
                  size="small"
                  variant="secondary"
                  style={{ marginLeft: '10px' }}
                >
                  📷 Escanear
                </Button>
                {isSearching && (
                  <Button
                    onClick={() => {
                      setSearchTerm('');
                      setIsSearching(false);
                      setProductsToDisplay([]);
                      lastVisibleProductRef.current = null;
                      localPaginationIndexRef.current = 0;
                      filteredLocalProductsRef.current = [];
                      setHasMoreProducts(true);
                      // CAMBIO: Al limpiar, no se carga nada, solo se espera la nueva búsqueda
                      // fetchProductsData(selectedBrand.id, selectedBranch.id_sucursal, true, false, '');
                    }}
                    size="small"
                    variant="secondary"
                    style={{ marginLeft: '10px' }}
                  >
                    Limpiar
                  </Button>
                )}
              </div>

              {isLoadingProducts && productsToDisplay.length === 0 ? (
                <p className="loading-message">Cargando productos...</p>
              ) : (
                groupedProductsByBrand.length > 0 ? (
                  <div className="product-categories-wrapper">
                    {groupedProductsByBrand.map(([brandName, products]) => (
                      <div key={brandName} className="product-category-group">
                        <h4 className="category-title">{brandName}</h4>
                        <div className="product-cards-wrapper">
                          {products.map(product => (
                            <SupermarketProductItem
                              key={product.id}
                              product={product}
                              onAddToList={handleAddProductToUserList}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  searchTerm.trim() !== '' && selectedBranch && !isLoadingProducts ? (
                    <p className="no-products-message">No se encontraron productos para "{searchTerm}" en esta sucursal.</p>
                  ) : (
                    <p className="no-products-message">
                      {selectedBranch ? 'Utiliza la barra de búsqueda para encontrar productos.' : 'Selecciona un supermercado para ver los precios.'}
                    </p>
                  )
                )
              )}

              {hasMoreProducts && productsToDisplay.length > 0 && (
                <Button
                  onClick={handleLoadMore}
                  disabled={isLoadingProducts}
                  size="medium"
                  variant="secondary"
                  style={{ marginTop: '20px' }}
                >
                  {isLoadingProducts ? 'Cargando...' : 'Cargar más productos'}
                </Button>
              )}
              {!hasMoreProducts && productsToDisplay.length > 0 && !isLoadingProducts && (
                <p className="no-more-products-message">No hay más productos para cargar.</p>
              )}
            </>
          ) : (
            <p className="select-supermarket-message">Por favor, selecciona un supermercado para empezar.</p>
          )}
        </div>
      </div>
    </div >
  );
};

export default Supermercados;