import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import './Supermercados.css';
import Input from '../Input/Input';
import Button from '../Buttons/Button';
import SupermarketProductItem from './SupermarketProductItem/SupermarketProductItem';

import { dbFirestore } from '../../firebase/config';
import { collection, getDocs, query, limit, startAfter, where, orderBy } from 'firebase/firestore';

import carrefourSuperData from '../../data/super/carrefour.json';
import diaSuperData from '../../data/super/dia.json';
import changomasSuperData from '../../data/super/changomas.json';

import carrefourDefaultProducts from '../../data/products/carrefour/1.json';
import diaDefaultProducts from '../../data/products/dia/87.json';
import changomasDefaultProducts from '../../data/products/changomas/1004.json';

const LOCAL_BRANDS_BRANCHES_MAP = {
  carrefour: carrefourSuperData,
  dia: diaSuperData,
  changomas: changomasSuperData,
};

const LOCAL_BRAND_DEFAULT_PRODUCTS_MAP = {
  carrefour: carrefourDefaultProducts,
  dia: diaDefaultProducts,
  changomas: changomasDefaultProducts,
};

const LOCAL_BRAND_DEFAULT_BRANCH_IDS = {
  dia: '87',
  changomas: '1004',
  carrefour: '1'
}

const PRODUCTS_PER_PAGE = 20;

const Supermercados = () => {
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [productsToDisplay, setProductsToDisplay] = useState([]);

  const lastVisibleProductRef = useRef(null);
  const allLocalProductsLoadedRef = useRef([]);
  const filteredLocalProductsRef = useRef([]);
  const localPaginationIndexRef = useRef(0);

  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingBrands, setIsLoadingBrands] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [allBrandsFirebase, setAllBrandsFirebase] = useState([]);
  const [dataSource, setDataSource] = useState('Firestore');
  const [error, setError] = useState(null);

  const handleAddProductToUserList = useCallback((product) => {
    console.log('Agregando producto a la lista del usuario (simulado):', product);
    alert(`"${product.nombre}" de ${product.marca_producto} agregado a tu lista (simulado).`);
  }, []);

const getLocalBranchInfoFromBranchesList = (brandId, branchesList) => {
  if (!branchesList || branchesList.length === 0) {
    console.warn(`getLocalBranchInfoFromBranchesList: No hay sucursales en la lista local para ${brandId}.`);
    return null;
  }

  const defaultBranchId = LOCAL_BRAND_DEFAULT_BRANCH_IDS[brandId.toLowerCase()];

  if (defaultBranchId) {
    const matchingBranch = branchesList.find(
      b => String(b.id_sucursal) === String(defaultBranchId)
    );
    if (matchingBranch) {
      return {
        id_sucursal: String(matchingBranch.id_sucursal),
        nombre_sucursal: matchingBranch.nombre_sucursal || `${brandId.charAt(0).toUpperCase() + brandId.slice(1)} Sucursal Local`
      };
    } else {
      console.warn(`No se encontró la sucursal con ID ${defaultBranchId} para ${brandId} en datos locales.`);
    }
  }

  // Si no hay un ID predefinido o no se encontró la sucursal, usamos la primera
  const defaultBranch = branchesList[0];
  return {
    id_sucursal: String(defaultBranch.id_sucursal),
    nombre_sucursal: defaultBranch.nombre_sucursal || `${brandId.charAt(0).toUpperCase() + brandId.slice(1)} Sucursal Local`
  };
};


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

        const localBrands = Object.entries(LOCAL_BRANDS_BRANCHES_MAP).map(([brandId, sucursales]) => {
          const firstSucursal = sucursales[0];
          return {
            id: brandId,
            nombre: firstSucursal?.marca || brandId.charAt(0).toUpperCase() + brandId.slice(1),
            logo: `logo_super/logo_${brandId}.png`,
          };
        });
        setAllBrandsFirebase(localBrands);
      } finally {
        setIsLoadingBrands(false);
      }
    };
    fetchAllBrands();
  }, []);

const fetchAndSetBranch = useCallback(async (brand) => {
  setIsLoadingProducts(true);
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
    currentDataSource = 'Local (Sucursales)';
    setDataSource(currentDataSource);

    const localBranchesList = LOCAL_BRANDS_BRANCHES_MAP[brand.id.toLowerCase()];
    if (localBranchesList) {
      const localDefaultBranchId = LOCAL_BRAND_DEFAULT_BRANCH_IDS[brand.id.toLowerCase()];
      if (localDefaultBranchId) {
        const matchingLocalBranch = localBranchesList.find(b => String(b.id_sucursal) === String(localDefaultBranchId));
        if (matchingLocalBranch) {
          branchToSet = {
            id_sucursal: String(matchingLocalBranch.id_sucursal),
            nombre_sucursal: matchingLocalBranch.nombre_sucursal || `${brand.id} Sucursal Local`
          };
          console.log(`Local (Sucursales): Sucursal por ID predefinido para ${brand.nombre}: ${branchToSet.nombre_sucursal} (ID: ${branchToSet.id_sucursal})`);
        } else {
          console.warn(`No se encontró la sucursal con ID ${localDefaultBranchId} en los datos locales de ${brand.nombre}, usando la primera.`);
          branchToSet = getLocalBranchInfoFromBranchesList(brand.id, localBranchesList);
        }
      } else {
        console.warn(`No hay ID predefinido para ${brand.nombre}, usando la primera sucursal local.`);
        branchToSet = getLocalBranchInfoFromBranchesList(brand.id, localBranchesList);
      }
    } else {
      console.error(`No hay datos de sucursales locales disponibles para la marca ${brand.nombre}.`);
      branchToSet = null;
    }
  } finally {
    console.log("Debug - fetchAndSetBranch: Valor final de branchToSet antes de setSelectedBranch:", branchToSet);
    setSelectedBranch(branchToSet);
  }
}, []);

const applySearchFilter = useCallback((products, term) => {
  console.log("Aplicando filtro. Productos recibidos:", products.length, "Término:", term);
  if (!term.trim()) {
    console.log("Término vacío, no se aplica filtro.");
    return [];
  }
  const escapedSearchTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const searchRegExp = new RegExp(escapedSearchTerm, 'i'); 

  const filtered = products.filter(p =>
    searchRegExp.test(p.nombre) ||
    (p.marca_producto && searchRegExp.test(p.marca_producto))
  );
  console.log("Productos filtrados:", filtered.length);
  return filtered;
}, []);

  const fetchProductsData = useCallback(async (brandId, branchId, initialLoad = true, searchModeParam = false, searchTermValueParam = '') => {
    console.log(`--- Iniciando fetchProductsData ---`);
    console.log(`Debug - isLoadingProducts (antes de la guardia): ${isLoadingProducts}`);
    console.log(`Brand ID: ${brandId}, Branch ID: ${branchId}, Initial Load: ${initialLoad}, Search Mode Param: ${searchModeParam}, Search Term Param: "${searchTermValueParam}"`);

    if (isLoadingProducts) {
      console.log("Abortando fetchProductsData: Ya se está cargando una operación.");
      return;
    }
    if (!brandId || !branchId) {
      console.log("Abortando fetchProductsData: IDs de marca o sucursal inválidos.");
      if (isLoadingProducts) setIsLoadingProducts(false);
      return;
    }

    setIsLoadingProducts(true);
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
            where('productos_descripcion', '>=', searchTermValueParam),
            where('productos_descripcion', '<=', searchTermValueParam + '\uf8ff'),
            orderBy('productos_descripcion'),
            limit(PRODUCTS_PER_PAGE)
          );
          if (!initialLoad && lastVisibleProductRef.current) {
            productsQuery = query(
              productsCollectionRef,
              where('productos_descripcion', '>=', searchTermValueParam),
              where('productos_descripcion', '<=', searchTermValueParam + '\uf8ff'),
              orderBy('productos_descripcion'),
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
            orderBy('productos_descripcion'),
            limit(PRODUCTS_PER_PAGE)
          );
          if (!initialLoad && lastVisibleProductRef.current) {
            productsQuery = query(
              productsCollectionRef,
              orderBy('productos_descripcion'),
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
          id: doc.id,
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

      } else {
        currentDataSourceUsed = 'Local (Productos)';
        console.log(`Cargando productos para ${brandId}/${branchId} desde archivos locales...`);

        if (initialLoad || searchTermValueParam !== searchTerm || allLocalProductsLoadedRef.current.length === 0) {
          try {
            let productDataModule;
            try {
              productDataModule = await import(`../../data/products/${brandId.toLowerCase()}/${branchId}.json`)
                .then(module => module.default);
            } catch (specificFileError) {
              console.warn(`No se encontró el archivo específico de productos: ../../data/products/${brandId.toLowerCase()}/${branchId}.json. Intentando con la sucursal por defecto...`);
              productDataModule = LOCAL_BRAND_DEFAULT_PRODUCTS_MAP[brandId.toLowerCase()];
              if (!productDataModule) {
                throw new Error(`No hay datos de productos por defecto para la marca ${brandId}.`);
              }
            }
            allLocalProductsLoadedRef.current = productDataModule.map(p => ({
              id: p.id_producto,
              ...p,
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
          if (initialLoad || searchTermValueParam !== searchTerm) {
            filteredLocalProductsRef.current = applySearchFilter(allLocalProductsLoadedRef.current, searchTermValueParam);
            localPaginationIndexRef.current = 0;
            console.log(`Local: Filtrados ${filteredLocalProductsRef.current.length} productos para búsqueda: "${searchTermValueParam}"`);
          }
          productsToWorkWith = filteredLocalProductsRef.current;
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
      }

      setProductsToDisplay(prevProducts => {
        let newProducts;
        if (initialLoad) {
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
      setIsLoadingProducts(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrand, selectedBranch, dataSource, applySearchFilter, searchTerm]);

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
  }, [selectedBrand, fetchAndSetBranch, setProductsToDisplay, setIsLoadingProducts, setHasMoreProducts, setIsSearching, setSearchTerm, setError]);

useEffect(() => {
  console.log("useEffect [selectedBranch]: selectedBranch ha cambiado.");
  if (selectedBranch && selectedBrand) {
    if (!selectedBranch.id_sucursal) {
      console.warn("Debug - selectedBranch.id_sucursal vacío o inválido. Abortando carga.");
      setError("Error: Sucursal seleccionada inválida.");
      return;
    }

    console.log("Debug - Sucursal y Marca seleccionadas. Iniciando carga inicial de productos.");
    setProductsToDisplay([]);
    lastVisibleProductRef.current = null;
    localPaginationIndexRef.current = 0;
    filteredLocalProductsRef.current = [];
    setHasMoreProducts(true);
    setIsSearching(false);
    allLocalProductsLoadedRef.current = [];

    fetchProductsData(selectedBrand.id, selectedBranch.id_sucursal, true, false, '');
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
}, [selectedBranch, selectedBrand, fetchProductsData]);
  const handleSelectBrand = (brand) => {
    console.log(`handleSelectBrand: Marca seleccionada: ${brand.nombre}`);
    setSelectedBrand(brand);
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
      console.log("handleSearch: Término de búsqueda vacío. Volviendo a la carga normal.");
      setIsSearching(false);
      setProductsToDisplay([]);
      lastVisibleProductRef.current = null;
      localPaginationIndexRef.current = 0;
      filteredLocalProductsRef.current = [];
      setHasMoreProducts(true);
      fetchProductsData(selectedBrand.id, selectedBranch.id_sucursal, true, false, '');
      setError(null);
      return;
    }

    setError(null);
    setIsSearching(true);
    setProductsToDisplay([]);
    lastVisibleProductRef.current = null;
    localPaginationIndexRef.current = 0;
    filteredLocalProductsRef.current = [];
    setHasMoreProducts(true);

    fetchProductsData(selectedBrand.id, selectedBranch.id_sucursal, true, true, term);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleLoadMore = () => {
    console.log(`handleLoadMore: Intentando cargar más. isLoadingProducts: ${isLoadingProducts}, hasMoreProducts: ${hasMoreProducts}`);
    if (!isLoadingProducts && hasMoreProducts && selectedBrand && selectedBranch) {
      fetchProductsData(selectedBrand.id, selectedBranch.id_sucursal, false, isSearching, searchTerm.trim());
    } else if (!hasMoreProducts) {
      console.log("handleLoadMore: Ya no hay más productos para cargar.");
    } else if (isLoadingProducts) {
      console.log("handleLoadMore: Ya se está cargando, esperando...");
    } else if (!selectedBrand || !selectedBranch) {
      console.log("handleLoadMore: No hay marca o sucursal seleccionada.");
    }
  };

  const groupedProductsByBrand = useMemo(() => {
    const groups = new Map();
    productsToDisplay.forEach(product => {
      const groupKey = product.productos_marca || 'Sin Marca';
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(product);
    });
    return Array.from(groups.entries());
  }, [productsToDisplay]);

  return (
    <div className="supermercados-container">
      <div className="supermercados-header">
        <h2>Explorar Supermercados y Precios</h2>
      </div>

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
              <h3>
                Precios en{' '}
                {selectedBranch ? (
                  selectedBranch.nombre_sucursal
                ) : (
                  selectedBrand.nombre
                )}
              </h3>
              {error && <p className="error-message">{error}</p>}
              <p className="data-source-info">Datos cargados desde: <strong>{dataSource}</strong></p>

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
    </div>
  );
};

export default Supermercados;