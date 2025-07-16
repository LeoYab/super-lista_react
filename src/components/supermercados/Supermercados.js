// src/components/supermercados/Supermercados.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './Supermercados.css';
import Input from '../Input/Input'; // Ajusta la ruta si es necesario
import Button from '../Buttons/Button'; // Ajusta la ruta si es necesario
import SupermarketProductItem from './SupermarketProductItem/SupermarketProductItem';

// Importa las funciones de Firestore y la instancia de dbFirestore
import { dbFirestore } from '../../firebase/config'; // ¡Asegúrate de que esta ruta sea correcta!
import { collection, getDocs } from 'firebase/firestore';

const Supermercados = () => {
    const [selectedBrand, setSelectedBrand] = useState(null);
    const [selectedBranch, setSelectedBranch] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [productsToDisplay, setProductsToDisplay] = useState([]);
    const [allProductsFromSelectedBranch, setAllProductsFromSelectedBranch] = useState([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);
    const [allBrandsFirebase, setAllBrandsFirebase] = useState([]); // Nuevo estado para las marcas cargadas de Firebase

    // handleAddProductToUserList sigue siendo un placeholder
    const handleAddProductToUserList = useCallback((product) => {
        console.log('Agregando producto a la lista del usuario (simulado):', product);
        alert(`"${product.nombre}" de ${product.marca_producto} agregado a tu lista (simulado).`);
    }, []);

    // --- NUEVA LÓGICA: Cargar todas las marcas de supermercados desde Firestore al inicio ---
    useEffect(() => {
        const fetchAllBrands = async () => {
            try {
                // Obtiene todos los documentos de la colección 'supermercados'
                const querySnapshot = await getDocs(collection(dbFirestore, 'supermercados'));
                const brands = querySnapshot.docs.map(doc => ({
                    id: doc.id,       // El ID del documento (ej. 'dia', 'carrefour')
                    ...doc.data()     // El resto de los datos del documento (nombre, logo, sucursal_id_default, etc.)
                }));
                setAllBrandsFirebase(brands);
                // Si quieres seleccionar una marca por defecto al cargar:
                // if (brands.length > 0) {
                //     setSelectedBrand(brands[0]);
                // }
            } catch (error) {
                console.error("Error al cargar las marcas de supermercados desde Firestore:", error);
            }
        };
        fetchAllBrands();
    }, []); // El array de dependencias vacío asegura que se ejecuta solo una vez al montar el componente

    // --- NUEVA LÓGICA: Obtener y establecer la sucursal por defecto de una marca desde Firestore ---
    const fetchAndSetBranch = useCallback(async (brand) => {
        setIsLoadingProducts(true);
        setAllProductsFromSelectedBranch([]);
        setProductsToDisplay([]);
        setSearchTerm(''); // Limpiar término de búsqueda al cambiar de marca

        try {
            // Obtiene todos los documentos de la subcolección 'sucursales' de la marca seleccionada
            const sucursalesCollectionRef = collection(dbFirestore, 'supermercados', brand.id, 'sucursales');
            const sucursalesSnapshot = await getDocs(sucursalesCollectionRef);
            const availableBranches = sucursalesSnapshot.docs.map(doc => ({
                id_sucursal: doc.id, // El ID del documento de la subcolección es el id_sucursal
                ...doc.data()
            }));

            let branchToSet = null;
            // Busca la sucursal por defecto si la marca tiene sucursal_id_default y existe en el array de sucursales
            if (brand.sucursal_id_default) {
                branchToSet = availableBranches.find(b => b.id_sucursal === brand.sucursal_id_default);
            }
            // Si no se encontró la por defecto, o no hay sucursal_id_default, toma la primera disponible
            if (!branchToSet && availableBranches.length > 0) {
                branchToSet = availableBranches[0];
            }

            setSelectedBranch(branchToSet);
            if (!branchToSet) {
                console.warn(`No se encontró la sucursal ${brand.sucursal_id_default || 'por defecto'} para la marca ${brand.nombre}.`);
                setIsLoadingProducts(false);
            }

        } catch (error) {
            console.error(`Error al cargar sucursal por defecto para la marca ${brand.nombre} desde Firestore:`, error);
            setSelectedBranch(null);
            setIsLoadingProducts(false);
        }
    }, []); // Dependencias: ninguna, ya que 'brand' se pasa como argumento

    // applySearchFilter se mantiene igual, ya que filtra productos en memoria
    const applySearchFilter = useCallback((products, term) => {
        if (!term.trim()) {
            return [];
        }
        const escapedSearchTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegExp = new RegExp(`(^|\\b)${escapedSearchTerm}(\\b|$)`, 'i');

        return products.filter(p =>
            searchRegExp.test(p.nombre) ||
            (p.marca_producto && searchRegExp.test(p.marca_producto))
        );
    }, []);

    // --- NUEVA LÓGICA: Obtener productos de una sucursal específica desde Firestore ---
    const fetchProductsByBranch = useCallback(async (brandId, branchId) => {
        setIsLoadingProducts(true);
        setAllProductsFromSelectedBranch([]);
        setProductsToDisplay([]);

        try {
            // Obtiene todos los documentos de la subcolección 'productos' de la sucursal seleccionada
            const productsCollectionRef = collection(dbFirestore, 'supermercados', brandId, 'sucursales', branchId, 'productos');
            const productsSnapshot = await getDocs(productsCollectionRef);
            const loadedProducts = productsSnapshot.docs.map(doc => ({
                id: doc.id, // El ID del documento de Firestore es el ID del producto
                ...doc.data(),
                supermercado_marca: selectedBrand?.nombre || brandId.charAt(0).toUpperCase() + brandId.slice(1), // Usa el nombre de la marca del estado
                sucursal_nombre: selectedBranch?.nombre_sucursal || 'Desconocida' // Usa el nombre de la sucursal del estado
            }));
            setAllProductsFromSelectedBranch(loadedProducts);
        } catch (error) {
            console.error(`Error al cargar productos para la sucursal ${branchId} de la marca ${brandId} desde Firestore:`, error);
            setAllProductsFromSelectedBranch([]);
            setProductsToDisplay([]);
        } finally {
            setIsLoadingProducts(false);
        }
    }, [selectedBrand, selectedBranch]); // Dependencias para obtener los nombres de marca y sucursal correctos

    // Efecto para llamar a fetchAndSetBranch cuando cambia la marca seleccionada
    useEffect(() => {
        if (selectedBrand) {
            fetchAndSetBranch(selectedBrand);
        } else {
            setSelectedBranch(null);
            setAllProductsFromSelectedBranch([]);
            setProductsToDisplay([]);
            setIsLoadingProducts(false);
        }
    }, [selectedBrand, fetchAndSetBranch]);

    // Efecto para llamar a fetchProductsByBranch cuando cambia la sucursal seleccionada
    useEffect(() => {
        // Asegúrate de que selectedBrand y selectedBranch.id_sucursal estén definidos para la consulta
        if (selectedBranch && selectedBranch.id_sucursal && selectedBrand) {
            fetchProductsByBranch(selectedBrand.id, selectedBranch.id_sucursal);
        } else {
            setAllProductsFromSelectedBranch([]);
            setProductsToDisplay([]);
            setIsLoadingProducts(false);
        }
    }, [selectedBranch, selectedBrand, fetchProductsByBranch]); // selectedBrand también es dependencia ahora

    const handleSelectBrand = (brand) => {
        setSelectedBrand(brand);
        setSearchTerm('');
        setProductsToDisplay([]);
    };

    const handleSearch = () => {
        if (!selectedBranch) {
            setProductsToDisplay([]);
            console.warn("No hay sucursal seleccionada para realizar la búsqueda.");
            return;
        }
        const filteredProducts = applySearchFilter(allProductsFromSelectedBranch, searchTerm);
        setProductsToDisplay(filteredProducts);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    const groupedProductsByBrand = useMemo(() => {
        const groups = new Map();
        productsToDisplay.forEach(product => {
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
            <div className="supermercados-header">
                <h2>Explorar Supermercados y Precios</h2>
            </div>

            <div className="supermarket-slider-wrapper">
                <h3>Selecciona un Supermercado:</h3>
                <div className="supermarket-slider">
                    {/* Renderiza las marcas cargadas desde Firebase */}
                    {allBrandsFirebase.length > 0 ? (
                        allBrandsFirebase.map(brand => (
                            <div
                                key={brand.id} // Usa el ID del documento de Firestore como clave
                                className={`supermarket-card ${selectedBrand && selectedBrand.id === brand.id ? 'active' : ''}`}
                                onClick={() => handleSelectBrand(brand)}
                            >
                                {/* `brand.logo` y `brand.nombre` vienen directamente del documento de Firestore */}
                                <img src={brand.logo} alt={brand.nombre} className="supermarket-logo" />
                                <p className="supermarket-name">{brand.nombre}</p>
                            </div>
                        ))
                    ) : (
                        <p>Cargando marcas de supermercados...</p>
                    )}
                </div>
            </div>

            <div className="supermercados-content">
                <div className="supermercados-list">
                    {selectedBrand ? (
                        <>
                            <h3>
                                Precios en&nbsp;
                                {selectedBranch ? (
                                    // Muestra el nombre de la sucursal si hay una seleccionada
                                    selectedBranch.nombre_sucursal
                                ) : (
                                    // Si no hay sucursal seleccionada (aún cargando o no se encontró por defecto), muestra el nombre de la marca
                                    selectedBrand.nombre
                                )}
                            </h3>
                            <div className="product-search-bar">
                                <Input
                                    type="text"
                                    placeholder="Buscar productos por nombre o marca..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                />
                                <Button onClick={handleSearch} size="small" variant="primary">Buscar</Button>
                            </div>

                            {isLoadingProducts ? (
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
                                    searchTerm.trim() !== '' && selectedBranch ? (
                                        <p className="no-products-message">No se encontraron productos para "{searchTerm}" en esta sucursal.</p>
                                    ) : (
                                        <p className="no-products-message">
                                            {selectedBranch ? 'Utiliza la barra de búsqueda para encontrar productos.' : 'Selecciona un supermercado para ver los precios.'}
                                        </p>
                                    )
                                )
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