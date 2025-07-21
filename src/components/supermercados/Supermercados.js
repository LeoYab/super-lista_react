import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import './Supermercados.css';
import Input from '../Input/Input';
import Button from '../Buttons/Button';
import SupermarketProductItem from './SupermarketProductItem/SupermarketProductItem';

import { dbFirestore } from '../../firebase/config';
import { collection, getDocs, query, limit, startAfter, where, orderBy } from 'firebase/firestore';

// MODIFICADO: Importa tus datos locales de SUCURSALES (asegúrate de que las rutas sean correctas)
import carrefourSuperData from '../../data/super/carrefour.json';
import diaSuperData from '../../data/super/dia.json';
import changomasSuperData from '../../data/super/changomas.json';

// NUEVO: Importa tus datos locales de PRODUCTOS de una sucursal por defecto para cada marca.
// Asegúrate de que estos archivos EXISTAN y contengan una LISTA DE OBJETOS DE PRODUCTOS.
// Por ejemplo, '../../data/products/carrefour/1.json' debería ser una lista de productos.
import carrefourDefaultProducts from '../../data/products/carrefour/1.json'; // Asume sucursal '1' como default para Carrefour
import diaDefaultProducts from '../../data/products/dia/87.json';           // Asume sucursal '87' como default para Día
// import changomasDefaultProducts from '../../data/products/changomas/X.json'; // Descomenta y ajusta si tienes uno para ChangoMas

// MODIFICADO: Mapeo para datos de SUCURSALES locales si Firestore falla
const LOCAL_BRANDS_BRANCHES_MAP = {
  carrefour: carrefourSuperData,
  dia: diaSuperData,
  changomas: changomasSuperData,
};

// NUEVO: Mapeo para datos de PRODUCTOS locales de la sucursal por defecto de cada marca
const LOCAL_BRAND_DEFAULT_PRODUCTS_MAP = {
  carrefour: carrefourDefaultProducts,
  dia: diaDefaultProducts,
  // changomas: changomasDefaultProducts, // Descomenta si tienes el archivo
};


const PRODUCTS_PER_PAGE = 20;

const Supermercados = () => {
  // Estados principales
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [productsToDisplay, setProductsToDisplay] = useState([]);

  // Refs para manejo de paginación y datos locales
  const lastVisibleProductRef = useRef(null); // Para paginación de Firestore
  const allLocalProductsLoadedRef = useRef([]); // Almacena todos los productos locales de la sucursal activa
  const filteredLocalProductsRef = useRef([]); // Almacena productos filtrados para búsqueda local
  const localPaginationIndexRef = useRef(0); // Índice para paginación de datos locales

  // Estados de carga y UI
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingBrands, setIsLoadingBrands] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [allBrandsFirebase, setAllBrandsFirebase] = useState([]);
  const [dataSource, setDataSource] = useState('Firestore'); // Indica de dónde vienen los datos (Firestore o Local)
  const [error, setError] = useState(null);

  // Callback para añadir producto (se mantiene igual)
  const handleAddProductToUserList = useCallback((product) => {
    console.log('Agregando producto a la lista del usuario (simulado):', product);
    alert(`"${product.nombre}" de ${product.marca_producto} agregado a tu lista (simulado).`);
  }, []);

  // MODIFICADO: Función para inferir la sucursal de una LISTA DE SUCURSALES (no de productos)
  const getLocalBranchInfoFromBranchesList = (brandId, branchesList) => {
    if (!branchesList || branchesList.length === 0) {
      console.warn(`getLocalBranchInfoFromBranchesList: No hay sucursales en la lista local para ${brandId}.`);
      return null;
    }
    // Asume la primera sucursal como la predeterminada para el fallback
    const defaultBranch = branchesList[0];
    return {
      id_sucursal: String(defaultBranch.id_sucursal), // Asegúrate de que sea string
      nombre_sucursal: defaultBranch.nombre_sucursal || `${brandId.charAt(0).toUpperCase() + brandId.slice(1)} Sucursal Local`
    };
  };

  // --- Efecto: Carga inicial de marcas de supermercado ---
  useEffect(() => {
    const fetchAllBrands = async () => {
      setIsLoadingBrands(true);
      setError(null);
      try {
        console.log("Intentando cargar marcas de supermercados desde Firestore...");
        const querySnapshot = await getDocs(collection(dbFirestore, 'supermercados'));
        const brands = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        if (brands.length > 0) {
          setAllBrandsFirebase(brands);
          setDataSource('Firestore');
          console.log("Marcas cargadas exitosamente desde Firestore.");
        } else {
          console.warn("Firestore no devolvió marcas. Intentando cargar desde archivos locales...");
          throw new Error("No data from Firestore, attempting local fallback for brands.");
        }

      } catch (firestoreError) {
        console.error("Error al cargar las marcas de supermercados desde Firestore. Fallback a datos locales:", firestoreError);
        setError("Error al cargar marcas de supermercados. Usando datos locales de respaldo.");
        setDataSource('Local (Marcas)');

        // Fallback a datos de marcas locales si Firestore falla
        // MODIFICADO: Ahora usa LOCAL_BRANDS_BRANCHES_MAP para obtener la información de la marca
        const localBrands = Object.entries(LOCAL_BRANDS_BRANCHES_MAP).map(([brandId, sucursales]) => {
          const firstSucursal = sucursales[0];
          return {
            id: brandId,
            // Intenta usar la marca del primer objeto de sucursales, si no, capitaliza el ID
            nombre: firstSucursal?.marca || brandId.charAt(0).toUpperCase() + brandId.slice(1),
            logo: '', // No hay logos locales por defecto, se pueden añadir manualmente
          };
        });
        setAllBrandsFirebase(localBrands);
      } finally {
        setIsLoadingBrands(false);
      }
    };
    fetchAllBrands();
    // dbFirestore no necesita ser una dependencia porque es una instancia que no cambia.
    // LOCAL_BRANDS_BRANCHES_MAP tampoco cambia, por lo que no es una dependencia real.
    // ESLint puede sugerir incluirlos si los ve usados, pero en este contexto, es seguro omitirlos.
  }, []);

  // --- Callback: Carga y establece la sucursal por defecto para una marca seleccionada ---
  const fetchAndSetBranch = useCallback(async (brand) => {
    setIsLoadingProducts(true); // Activa el loading mientras se busca la sucursal
    allLocalProductsLoadedRef.current = [];
    filteredLocalProductsRef.current = [];
    localPaginationIndexRef.current = 0;
    lastVisibleProductRef.current = null;
    setProductsToDisplay([]);
    setSearchTerm('');
    setError(null);
    setIsSearching(false);

    let branchToSet = null;
    let currentDataSource = 'Firestore';

    try {
      const sucursalesCollectionRef = collection(dbFirestore, 'supermercados', brand.id, 'sucursales');
      const sucursalesSnapshot = await getDocs(sucursalesCollectionRef);
      const availableBranches = sucursalesSnapshot.docs.map(doc => ({
        id_sucursal: doc.id,
        ...doc.data()
      }));

      if (availableBranches.length === 0) {
        console.warn(`Firestore no devolvió sucursales para ${brand.nombre}. Intentando carga local.`);
        throw new Error("No data from Firestore, attempting local fallback for branch.");
      }

      if (brand.sucursal_id_default) {
        branchToSet = availableBranches.find(b => String(b.id_sucursal) === String(brand.sucursal_id_default));
      }
      if (!branchToSet && availableBranches.length > 0) {
        branchToSet = availableBranches[0];
      }

      if (!branchToSet) {
        console.warn(`No se encontró la sucursal por defecto (${brand.sucursal_id_default || 'primera'}) para ${brand.nombre} en Firestore.`);
        throw new Error("Default/first branch not found in Firestore. Attempting local fallback.");
      }
      setDataSource(currentDataSource);

    } catch (firestoreError) {
      console.error(`Error al cargar sucursal por defecto para ${brand.nombre} desde Firestore. Fallback a datos locales:`, firestoreError);
      setError(`Error al cargar sucursal de ${brand.nombre}. Usando datos locales de respaldo.`);
      currentDataSource = 'Local (Sucursales)'; // Indica fallback local para sucursales
      setDataSource(currentDataSource);

      // MODIFICADO: Usa LOCAL_BRANDS_BRANCHES_MAP para obtener la lista de sucursales locales
      const localBranchesList = LOCAL_BRANDS_BRANCHES_MAP[brand.id.toLowerCase()];
      if (localBranchesList) {
        branchToSet = getLocalBranchInfoFromBranchesList(brand.id, localBranchesList);
        if (branchToSet) {
          console.log(`Local (Sucursales): Sucursal inferida para ${brand.nombre}: ${branchToSet.nombre_sucursal} (ID: ${branchToSet.id_sucursal})`);
        } else {
          console.warn(`No se pudo inferir una sucursal de la lista local para ${brand.nombre}.`);
          branchToSet = null; // Asegura que branchToSet sea null si no se pudo inferir
        }
      } else {
        console.error(`No hay datos de sucursales locales disponibles para la marca ${brand.nombre} para inferir una sucursal.`);
        branchToSet = null;
      }
    } finally {
      console.log("Debug - fetchAndSetBranch: Valor final de branchToSet antes de setSelectedBranch:", branchToSet);
      setSelectedBranch(branchToSet);
      // El setIsLoadingProducts(false) se moverá al final de fetchProductsData
      // para que el spinner se mantenga hasta que los productos se carguen.
    }
  }, [setSelectedBranch, setProductsToDisplay, setSearchTerm, setError, setIsSearching, setDataSource, setIsLoadingProducts]); // MODIFICADO: Eliminadas LOCAL_BRANDS_BRANCHES_MAP y dbFirestore

  // --- Callback: Función para aplicar el filtro de búsqueda a una lista de productos ---
  const applySearchFilter = useCallback((products, term) => {
    if (!term.trim()) {
      return []; // Si el término está vacío, no filtra (retorna vacío para que se recargue la lista completa)
    }
    const escapedSearchTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escapa caracteres especiales
    const searchRegExp = new RegExp(`(^|\\b)${escapedSearchTerm}(\\b|$)`, 'i'); // RegEx para búsqueda por palabra completa (case-insensitive)

    return products.filter(p =>
      searchRegExp.test(p.productos_descripcion) || // CAMBIO: Usar productos_descripcion
      (p.productos_marca && searchRegExp.test(p.productos_marca))
    );
  }, []);

  // --- Callback: Función principal para cargar productos (desde Firestore o local) ---
  const fetchProductsData = useCallback(async (brandId, branchId, initialLoad = true, searchModeParam = false, searchTermValueParam = '') => {
    console.log(`--- Iniciando fetchProductsData ---`);
    console.log(`Debug - isLoadingProducts (antes de la guardia): ${isLoadingProducts}`);
    console.log(`Brand ID: ${brandId}, Branch ID: ${branchId}, Initial Load: ${initialLoad}, Search Mode Param: ${searchModeParam}, Search Term Param: "${searchTermValueParam}"`);

    // Guardia para evitar llamadas múltiples o inválidas
    if (isLoadingProducts) {
      console.log("Abortando fetchProductsData: Ya se está cargando una operación.");
      return;
    }
    if (!brandId || !branchId) {
      console.log("Abortando fetchProductsData: IDs de marca o sucursal inválidos.");
      // No establecemos isLoadingProducts(false) aquí si ya está false
      // Esto es para que no se apague el spinner si ya estaba encendido por la carga de la sucursal
      if (isLoadingProducts) setIsLoadingProducts(false);
      return;
    }

    setIsLoadingProducts(true);
    console.log("Debug - setIsLoadingProducts(true)");
    setError(null);
    let loadedProductsChunk = [];
    let currentDataSourceUsed = 'Firestore';

    try {
      if (dataSource.startsWith('Firestore')) {
        const productsCollectionRef = collection(dbFirestore, 'supermercados', brandId, 'sucursales', branchId, 'productos');
        let productsQuery;

        if (searchModeParam && searchTermValueParam) {
          productsQuery = query(
            productsCollectionRef,
            where('productos_descripcion', '>=', searchTermValueParam), // CAMBIO: Usar productos_descripcion
            where('productos_descripcion', '<=', searchTermValueParam + '\uf8ff'), // CAMBIO: Usar productos_descripcion
            orderBy('productos_descripcion'), // CAMBIO: Ordenar por productos_descripcion
            limit(PRODUCTS_PER_PAGE)
          );
          if (!initialLoad && lastVisibleProductRef.current) {
            productsQuery = query(
              productsCollectionRef,
              where('productos_descripcion', '>=', searchTermValueParam), // CAMBIO
              where('productos_descripcion', '<=', searchTermValueParam + '\uf8ff'), // CAMBIO
              orderBy('productos_descripcion'), // CAMBIO
              startAfter(lastVisibleProductRef.current),
              limit(PRODUCTS_PER_PAGE)
            );
            console.log("Firestore Query: Usando startAfter para búsqueda paginada.");
          } else {
            console.log("Firestore Query: Búsqueda inicial en Firestore.");
          }
        } else {
          productsQuery = query(
            productsCollectionRef,
            orderBy('productos_descripcion'), // CAMBIO: Ordenar por productos_descripcion
            limit(PRODUCTS_PER_PAGE)
          );
          if (!initialLoad && lastVisibleProductRef.current) {
            productsQuery = query(
              productsCollectionRef,
              orderBy('productos_descripcion'), // CAMBIO
              startAfter(lastVisibleProductRef.current),
              limit(PRODUCTS_PER_PAGE)
            );
            console.log("Firestore Query: Usando startAfter para paginación normal.");
          } else {
            console.log("Firestore Query: Paginación normal inicial.");
          }
        }

        console.log(`Cargando productos para ${brandId}/${branchId} desde Firestore...`);
        const productsSnapshot = await getDocs(productsQuery);
        loadedProductsChunk = productsSnapshot.docs.map(doc => ({
          id: doc.id, // ID del documento de Firestore, que es único
          ...doc.data(),
          supermercado_marca: selectedBrand?.nombre || brandId.charAt(0).toUpperCase() + brandId.slice(1),
          sucursal_nombre: selectedBranch?.nombre_sucursal || 'Desconocida'
        }));

        console.log(`Firestore: Se cargaron ${loadedProductsChunk.length} productos.`);
        if (productsSnapshot.docs.length > 0) {
          lastVisibleProductRef.current = productsSnapshot.docs[productsSnapshot.docs.length - 1];
          console.log(`Firestore: lastVisibleProductRef.current actualizado a: ${lastVisibleProductRef.current.id}`);
        } else {
          lastVisibleProductRef.current = null;
          console.log(`Firestore: No se encontraron documentos, lastVisibleProductRef.current = null.`);
        }
        setHasMoreProducts(loadedProductsChunk.length === PRODUCTS_PER_PAGE);

      } else { // Manejo para datos locales (desde archivos JSON)
        currentDataSourceUsed = 'Local (Productos)';
        console.log(`Cargando productos para ${brandId}/${branchId} desde archivos locales...`);

        // MODIFICADO: Si estamos en modo búsqueda o es carga inicial y no hay productos cargados,
        // o si el término de búsqueda ha cambiado, recarga todos los productos locales.
        if (initialLoad || searchTermValueParam !== searchTerm || allLocalProductsLoadedRef.current.length === 0) {
          try {
            // MODIFICADO: Carga los productos de la sucursal predeterminada si no se encuentra el archivo específico
            let productDataModule;
            try {
                productDataModule = await import(`../../data/products/${brandId.toLowerCase()}/${branchId}.json`)
                    .then(module => module.default);
            } catch (specificFileError) {
                console.warn(`No se encontró el archivo específico de productos: ../../data/products/${brandId.toLowerCase()}/${branchId}.json. Intentando con la sucursal por defecto...`);
                // Fallback a los productos por defecto de la marca si el archivo específico no existe
                productDataModule = LOCAL_BRAND_DEFAULT_PRODUCTS_MAP[brandId.toLowerCase()];
                if (!productDataModule) {
                    throw new Error(`No hay datos de productos por defecto para la marca ${brandId}.`);
                }
            }

            allLocalProductsLoadedRef.current = productDataModule.map(p => ({
              // CAMBIO CLAVE: Usa id_producto del JSON como el 'id' para React
              id: p.id_producto,
              ...p, // Mantiene todas las demás propiedades originales
              supermercado_marca: selectedBrand?.nombre || brandId.charAt(0).toUpperCase() + brandId.slice(1),
              sucursal_nombre: selectedBranch?.nombre_sucursal || 'Desconocida'
            }));
            console.log(`Local: Se cargaron ${allLocalProductsLoadedRef.current.length} productos TOTALES desde el archivo JSON.`);
          } catch (localError) {
            console.error(`Error al cargar productos locales para ${brandId}/${branchId}:`, localError);
            setError("Error: No se pudieron cargar productos ni de Firestore ni de archivos locales.");
            allLocalProductsLoadedRef.current = [];
            setIsLoadingProducts(false);
            setHasMoreProducts(false);
            return;
          }
        }

       let productsToWorkWith;
        if (searchModeParam && searchTermValueParam) {
          // Si es una nueva búsqueda o el término cambió, filtra de nuevo
          if (initialLoad || searchTermValueParam !== searchTerm) {
            filteredLocalProductsRef.current = applySearchFilter(allLocalProductsLoadedRef.current, searchTermValueParam);
            localPaginationIndexRef.current = 0; // Reinicia el índice para la nueva búsqueda
            console.log(`Local: Filtrados ${filteredLocalProductsRef.current.length} productos para búsqueda: "${searchTermValueParam}"`);
          }
          productsToWorkWith = filteredLocalProductsRef.current;
        } else {
          // Si no hay búsqueda, usa todos los productos cargados
          productsToWorkWith = allLocalProductsLoadedRef.current;
          filteredLocalProductsRef.current = []; // Limpia filtros si no estamos buscando
          if (initialLoad) {
            localPaginationIndexRef.current = 0; // Reinicia el índice para carga normal inicial
          }
        }

        // Paginación local usando los índices de los refs
        const startIndex = localPaginationIndexRef.current;
        const endIndex = startIndex + PRODUCTS_PER_PAGE;
        loadedProductsChunk = productsToWorkWith.slice(startIndex, endIndex);

        // Actualizar el índice de paginación para la próxima carga
        localPaginationIndexRef.current = endIndex;

        console.log(`Local: Total de productos a usar: ${productsToWorkWith.length}`);
        console.log(`Local: Paginando desde índice ${startIndex} hasta ${endIndex}. Se cargaron ${loadedProductsChunk.length} productos.`);
        console.log(`Local: Nuevo localPaginationIndexRef.current: ${localPaginationIndexRef.current}`);

        // Determinar si hay más productos para cargar localmente
        setHasMoreProducts(endIndex < productsToWorkWith.length);
        console.log(`Local: hasMoreProducts: ${endIndex < productsToWorkWith.length}`);
      }

      // Actualiza el estado de `productsToDisplay`
      setProductsToDisplay(prevProducts => {
        let newProducts;
        if (initialLoad) {
          // Si es carga inicial, reemplaza la lista
          newProducts = loadedProductsChunk;
        } else {
          // Si no es carga inicial, añade los nuevos productos evitando duplicados
          const newProductIds = new Set(loadedProductsChunk.map(p => p.id));
          const filteredPrevProducts = prevProducts.filter(p => !newProductIds.has(p.id));
          newProducts = [...filteredPrevProducts, ...loadedProductsChunk];
        }
        console.log(`Debug - productsToDisplay ahora tiene ${newProducts.length} productos.`);
        return newProducts;
      });
      setDataSource(currentDataSourceUsed); // Actualiza la fuente de datos mostrada

    } catch (error) {
      console.error(`Error general al cargar productos para ${brandId}/${branchId}:`, error);
      setError(`Error al cargar productos: ${error.message}.`);
      setProductsToDisplay([]); // Limpia la lista si hay error
      setHasMoreProducts(false); // No hay más productos si hubo un error
    } finally {
      setIsLoadingProducts(false); // IMPORTANTE: Siempre apaga el loading
      console.log(`Debug - setIsLoadingProducts(false) en finally.`);
      console.log(`--- Fin de fetchProductsData. `);
    }
  }, [selectedBrand, selectedBranch, dataSource, applySearchFilter, searchTerm, setIsLoadingProducts, isLoadingProducts, setProductsToDisplay, setHasMoreProducts, setError]); // MODIFICADO: Eliminada dbFirestore

  // --- Efecto: Dispara la carga de sucursal cuando se selecciona una marca ---
  useEffect(() => {
    console.log("useEffect [selectedBrand]: selectedBrand ha cambiado.");
    if (selectedBrand) {
      console.log("Debug - Marca seleccionada. Iniciando búsqueda de sucursal.");
      // Llama a fetchAndSetBranch para encontrar la sucursal por defecto
      fetchAndSetBranch(selectedBrand);
    } else {
      // Caso inicial o sin marca seleccionada, asegurar estados limpios
      setSelectedBranch(null); // Asegura que la sucursal se limpie si la marca se deselecciona
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
  }, [selectedBrand, fetchAndSetBranch, setProductsToDisplay, setIsLoadingProducts, setHasMoreProducts, setIsSearching, setSearchTerm, setError]);


  // --- Efecto: Dispara la carga de productos cuando se selecciona una sucursal ---
  useEffect(() => {
    console.log("useEffect [selectedBranch]: selectedBranch ha cambiado.");
    // AHORA el control de isLoadingProducts se hace aquí con el flag.
    if (selectedBranch && selectedBrand && !isLoadingProducts) { // Asegúrate de que ambos estén definidos y que NO se esté cargando ya
      console.log("Debug - Sucursal y Marca seleccionadas. Iniciando carga inicial de productos.");
      setProductsToDisplay([]); // Limpia la lista antes de una nueva carga inicial
      lastVisibleProductRef.current = null; // Reinicia ref de Firestore
      localPaginationIndexRef.current = 0; // Reinicia ref de paginación local
      filteredLocalProductsRef.current = []; // Limpia productos filtrados
      setHasMoreProducts(true); // Asume que hay más productos al inicio
      setIsSearching(false); // No estamos en modo búsqueda al iniciar la sucursal
      allLocalProductsLoadedRef.current = []; // Limpia todos los productos locales cargados

      // Llama a fetchProductsData para la carga inicial
      fetchProductsData(selectedBrand.id, selectedBranch.id_sucursal, true, false, '');
    } else if (!selectedBranch && selectedBrand) {
      // Caso donde hay marca pero no se pudo encontrar una sucursal (ej. fallback falló)
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
    } else if (!selectedBrand && !selectedBranch) { // Asegurarse de que si no hay marca, no hay sucursal
      // Caso inicial o sin marca/sucursal seleccionada, asegurar estados limpios
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
  }, [selectedBranch, selectedBrand, fetchProductsData, isLoadingProducts]); // Incluye isLoadingProducts para la guardia en el efecto

  // --- Manejador de selección de marca ---
  const handleSelectBrand = (brand) => {
    console.log(`handleSelectBrand: Marca seleccionada: ${brand.nombre}`);
    setSelectedBrand(brand);
    // Limpiar todos los estados relacionados con productos y búsqueda al cambiar de marca
    setSearchTerm('');
    setProductsToDisplay([]);
    setError(null);
    lastVisibleProductRef.current = null;
    localPaginationIndexRef.current = 0;
    filteredLocalProductsRef.current = [];
    setHasMoreProducts(true);
    setIsSearching(false);
    allLocalProductsLoadedRef.current = [];
  };

  // --- Manejador de búsqueda de productos ---
  const handleSearch = () => {
    console.log(`handleSearch: Término: "${searchTerm}"`);
    if (!selectedBranch) {
      setProductsToDisplay([]);
      setError("Selecciona una sucursal para buscar productos.");
      console.log("handleSearch: No hay sucursal seleccionada. Abortando búsqueda.");
      return;
    }

    const term = searchTerm.trim();
    if (!term) { // Si el término de búsqueda está vacío, volver al estado normal
      console.log("handleSearch: Término de búsqueda vacío. Volviendo a la carga normal.");
      setIsSearching(false); // Sale del modo búsqueda
      setProductsToDisplay([]); // Limpia la lista actual
      lastVisibleProductRef.current = null; // Reinicia paginación Firestore
      localPaginationIndexRef.current = 0; // Reinicia paginación local
      filteredLocalProductsRef.current = []; // Limpia filtros locales
      setHasMoreProducts(true); // Asume que hay más productos en la lista completa
      // Dispara una nueva carga inicial de todos los productos (sin búsqueda)
      fetchProductsData(selectedBrand.id, selectedBranch.id_sucursal, true, false, '');
      setError(null);
      return;
    }

    // Si hay un término de búsqueda, entra en modo búsqueda
    setError(null);
    setIsSearching(true); // Activa el modo búsqueda
    setProductsToDisplay([]); // Limpia los productos actuales para la nueva búsqueda
    lastVisibleProductRef.current = null; // Reinicia paginación Firestore
    localPaginationIndexRef.current = 0; // Reinicia paginación local para la nueva búsqueda
    filteredLocalProductsRef.current = []; // Limpia filtros para forzar recálculo
    setHasMoreProducts(true); // Asume que puede haber más resultados para la búsqueda

    // Dispara la carga inicial de productos filtrados
    fetchProductsData(selectedBrand.id, selectedBranch.id_sucursal, true, true, term);
  };

  // --- Manejador de tecla Enter para el input de búsqueda ---
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // --- Manejador de "Cargar más productos" ---
  const handleLoadMore = () => {
    console.log(`handleLoadMore: Intentando cargar más. isLoadingProducts: ${isLoadingProducts}, hasMoreProducts: ${hasMoreProducts}`);
    if (!isLoadingProducts && hasMoreProducts && selectedBrand && selectedBranch) {
      // Llama a fetchProductsData en modo de carga adicional (initialLoad = false)
      fetchProductsData(selectedBrand.id, selectedBranch.id_sucursal, false, isSearching, searchTerm.trim());
    } else if (!hasMoreProducts) {
      console.log("handleLoadMore: Ya no hay más productos para cargar.");
    } else if (isLoadingProducts) {
      console.log("handleLoadMore: Ya se está cargando, esperando...");
    } else if (!selectedBrand || !selectedBranch) {
      console.log("handleLoadMore: No hay marca o sucursal seleccionada.");
    }
  };

  // --- useMemo para agrupar productos por marca (se mantiene igual) ---
  const groupedProductsByBrand = useMemo(() => {
    const groups = new Map();
    productsToDisplay.forEach(product => {
      const groupKey = product.productos_marca || 'Sin Marca'; // CAMBIO: Agrupar por productos_marca
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(product);
    });
    return Array.from(groups.entries());
  }, [productsToDisplay]);

  // --- Renderizado del componente ---
  return (
    <div className="supermercados-container">
      <div className="supermercados-header">
        <h2>Explorar Supermercados y Precios</h2>
      </div>

      {/* Sección de selección de supermercado */}
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

      {/* Sección de contenido de productos */}
      <div className="supermercados-content">
        <div className="supermercados-list">
          {selectedBrand ? (
            <>
              <h3>
                Precios en&nbsp;
                {selectedBranch ? (
                  selectedBranch.nombre_sucursal
                ) : (
                  selectedBrand.nombre
                )}
              </h3>
              {error && <p className="error-message">{error}</p>}
              <p className="data-source-info">Datos cargados desde: <strong>{dataSource}</strong></p>

              {/* Barra de búsqueda de productos */}
              <div className="product-search-bar">
                <Input
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
                      fetchProductsData(selectedBrand.id, selectedBranch.id_sucursal, true, false, '');
                    }}
                    size="small"
                    variant="secondary"
                    style={{ marginLeft: '10px' }}
                  >
                    Limpiar
                  </Button>
                )}
              </div>

              {/* Mensajes de estado de carga o no productos */}
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

              {/* Botón para cargar más productos */}
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
              {/* Mensaje cuando no hay más productos para cargar */}
              {!hasMoreProducts && productsToDisplay.length > 0 && !isLoadingProducts && (
                <p className="no-more-products-message">No hay más productos para cargar.</p>
              )}
            </>
          ) : (
            <p className="select-supermarket-message">Por favor, selecciona un supermercado para empezar.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Supermercados;