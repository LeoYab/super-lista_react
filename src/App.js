// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, AuthProvider } from './context/AuthContext';
import { db } from './firebase/config';
import { ref, onValue, push, remove, update, set } from 'firebase/database';
import Swal from 'sweetalert2';

// Importa tus componentes
import Header from './components/Header/Header';
import ProductForm from './components/ProductForm/ProductForm';
import ProductList from './components/ProductList/ProductList';
import AuthPage from './pages/AuthPage/AuthPage';
import SidebarMenu from './components/SidebarMenu/SidebarMenu';
import SearchBar from './components/SearchBar/SearchBar';
import TotalSummary from './TotalSummary/TotalSummary';
import Button from './components/Buttons/Button'; // Make sure to import Button

// Importa tus estilos
import './App.css';
import './components/Header/Header.css';
import './components/Input/Input.css';
import './components/Select/Select.css';
import './TotalSummary/TotalSummary.css';
import './components/Buttons/Button.css'; // Don't forget to import Button's CSS

function MainAppContent() {
  const { currentUser, logout } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);

  const [userLists, setUserLists] = useState([]);
  const [currentListId, setCurrentListId] = useState(null);
  const [currentListName, setCurrentListName] = useState('');

  const [editingProduct, setEditingProduct] = useState(null);
  const [showProductForm, setShowProductForm] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');

  // Firebase Refs
  const userListsRef = currentUser ? ref(db, `Users/${currentUser.uid}/User_Lists`) : null;
  const categoriesRef = ref(db, 'Categories');

  // Load Categories
  useEffect(() => {
    setLoadingCategories(true);
    const unsubscribe = onValue(categoriesRef, (snapshot) => {
      const data = snapshot.val();
      setCategories(data ? Object.values(data) : []);
      setLoadingCategories(false);
    }, (error) => {
      console.error("Error al cargar categorías:", error);
      setLoadingCategories(false);
    });
    return () => unsubscribe();
  }, []);

  // Load User Lists and Set Default List
  useEffect(() => {
    if (!currentUser) {
      setUserLists([]);
      setCurrentListId(null);
      setCurrentListName('');
      return;
    }

    const unsubscribe = onValue(userListsRef, (snapshot) => {
      const data = snapshot.val();
      const loadedLists = [];
      if (data) {
        for (let key in data) {
          loadedLists.push({
            id: key,
            nameList: data[key].nameList || 'Lista sin nombre',
            createdAt: data[key].createdAt || null
          });
        }
        loadedLists.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      }
      setUserLists(loadedLists);

      if (loadedLists.length > 0) {
        const selectedList = loadedLists.find(list => list.id === currentListId);
        if (selectedList) {
          setCurrentListId(selectedList.id);
          setCurrentListName(selectedList.nameList);
        } else {
          setCurrentListId(loadedLists[0].id);
          setCurrentListName(loadedLists[0].nameList);
        }
      } else {
        setCurrentListId(null);
        setCurrentListName('');
      }
    }, (error) => {
      console.error("Error al cargar listas del usuario:", error);
    });

    return () => unsubscribe();
  }, [currentUser, userListsRef, currentListId]);

  // Load Products for current list
  useEffect(() => {
    if (!currentUser || !currentListId) {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }

    setLoadingProducts(true);
    const currentListProductsRef = ref(db, `Users/${currentUser.uid}/User_Lists/${currentListId}/products`);

    const unsubscribe = onValue(currentListProductsRef, (snapshot) => {
      const data = snapshot.val();
      const loadedProducts = [];
      if (data) {
        for (let key in data) {
          loadedProducts.push({
            firebaseId: key,
            nombre: data[key].nameProd,
            valor: data[key].price,
            cantidad: data[key].quantity,
            category: data[key].category,
            icon: data[key].icon,
            completed: data[key].completed || false
          });
        }
      }
      setProducts(loadedProducts);
      setLoadingProducts(false);
    }, (error) => {
      console.error("Error al cargar productos:", error);
      setLoadingProducts(false);
    });

    return () => unsubscribe();
  }, [currentUser, currentListId]);

  // List management functions
  const createList = async (listName) => {
    if (!currentUser || !listName.trim()) return;
    try {
      const newListRef = push(userListsRef);
      await set(newListRef, {
        nameList: listName.trim(),
        createdAt: Date.now()
      });
      Swal.fire('¡Lista Creada!', `"${listName}" ha sido creada.`, 'success');
    } catch (error) {
      console.error("Error al crear nueva lista:", error);
      Swal.fire('Error', 'No se pudo crear la lista.', 'error');
    }
  };

  const deleteList = async (listIdToDelete) => {
    if (!currentUser || !listIdToDelete) return;
    try {
      const listRefToDelete = ref(db, `Users/${currentUser.uid}/User_Lists/${listIdToDelete}`);
      await remove(listRefToDelete);
      Swal.fire('¡Eliminada!', 'La lista ha sido eliminada.', 'success');
    } catch (error) {
      console.error("Error al eliminar lista:", error);
      Swal.fire('Error', 'No se pudo eliminar la lista.', 'error');
    }
  };

  const selectList = (listId) => {
    setCurrentListId(listId);
    const selected = userLists.find(list => list.id === listId);
    if (selected) {
      setCurrentListName(selected.nameList);
    }
    setEditingProduct(null);
    setShowProductForm(false);
  };

  // Product management functions (Firebase operations)
  const handleAddProduct = async (productoDataFormulario) => {
    if (!currentUser || !currentListId) return;
    try {
      const productsRef = ref(db, `Users/${currentUser.uid}/User_Lists/${currentListId}/products`);
      await push(productsRef, {
        nameProd: productoDataFormulario.nombre,
        price: parseFloat(productoDataFormulario.valor),
        quantity: parseInt(productoDataFormulario.cantidad),
        completed: false,
        category: productoDataFormulario.category,
        icon: productoDataFormulario.icon,
      });
      Swal.fire('¡Producto Añadido!', '', 'success');
      setShowProductForm(false);
    } catch (error) {
      console.error("Error al añadir producto:", error);
      Swal.fire('Error', 'No se pudo añadir el producto.', 'error');
    }
  };

  const handleEditProduct = async (firebaseId, productoDataFormulario) => {
    if (!currentUser || !currentListId) return;
    try {
      const productRef = ref(db, `Users/${currentUser.uid}/User_Lists/${currentListId}/products/${firebaseId}`);
      await update(productRef, {
        nameProd: productoDataFormulario.nombre,
        price: parseFloat(productoDataFormulario.valor),
        quantity: parseInt(productoDataFormulario.cantidad),
        category: productoDataFormulario.category,
        icon: productoDataFormulario.icon,
      });
      Swal.fire('¡Producto Actualizado!', '', 'success');
      setEditingProduct(null);
      setShowProductForm(false);
    } catch (error) {
      console.error("Error al actualizar producto:", error);
      Swal.fire('Error', 'No se pudo actualizar el producto.', 'error');
    }
  };

  const handleStartEditing = (product) => {
    setEditingProduct(product);
    setShowProductForm(true);
  };

  const handleCancelForm = () => {
    setEditingProduct(null);
    setShowProductForm(false);
  };

  const handleDeleteProduct = async (firebaseId) => {
    if (!currentUser || !currentListId) return;
    try {
      const productRef = ref(db, `Users/${currentUser.uid}/User_Lists/${currentListId}/products/${firebaseId}`);
      await remove(productRef);
    } catch (error) {
      console.error("Error al eliminar producto:", error);
      Swal.fire('Error', 'No se pudo eliminar el producto.', 'error');
    }
  };

  const toggleComplete = async (firebaseId) => {
    if (!currentUser || !currentListId) return;
    try {
      const productRef = ref(db, `Users/${currentUser.uid}/User_Lists/${currentListId}/products/${firebaseId}`);
      const productToUpdate = products.find(p => p.firebaseId === firebaseId);
      if (productToUpdate) {
        await update(productRef, {
          completed: !productToUpdate.completed
        });
      }
    } catch (error) {
      console.error("Error al actualizar estado de completado:", error);
    }
  };

  const clearAllProducts = async () => {
    if (!currentUser || !currentListId) return;
    Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Quieres vaciar todos los productos de "${currentListName}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, vaciar',
      cancelButtonText: 'Cancelar'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const productsRef = ref(db, `Users/${currentUser.uid}/User_Lists/${currentListId}/products`);
          await remove(productsRef);
          Swal.fire('¡Lista Vaciada!', 'Todos los productos han sido eliminados.', 'success');
        } catch (error) {
          console.error("Error al vaciar la lista:", error);
          Swal.fire('Error', 'No se pudo vaciar la lista.', 'error');
        }
      }
    });
  };

  const filteredProducts = products.filter(producto =>
    producto.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalProductos = filteredProducts.length;

  const totalGeneral = filteredProducts.reduce((sum, producto) => {
    if (!producto.completed) {
      return sum + ((producto.valor || 0) * (producto.cantidad || 0));
    }
    return sum;
  }, 0);

  // Function to handle toggle form button click (now directly in App.js)
  const handleToggleForm = () => {
    if (editingProduct) {
      setEditingProduct(null); // Clear editing state if we're canceling an edit
    }
    setShowProductForm(prev => !prev); // Toggle the form visibility
  };

  return (
    <div className="App">
      <Header />
      <div className="container">
        <SidebarMenu
          currentUser={currentUser}
          logout={logout}
          userLists={userLists}
          createList={createList}
          selectList={selectList}
          currentListId={currentListId}
          deleteList={deleteList}
        />

        {/* MAIN CONTENT AREA */}
        <div className="main-content-area">
          {currentListId ? (
            <>
              <div className="list-header">
                <h3 className="current-list-title">
                  <strong>Lista Actual: </strong>
                  {currentListName || 'Cargando...'}
                </h3>
                <h4>Total de Productos: {totalProductos || 'Vacío'}</h4>
              </div>
              {/* ProductList always visible */}
              {loadingProducts ? (
                <p className="loading-message">Cargando lista...</p>
              ) : (
                <ProductList
                  productos={filteredProducts}
                  busqueda={searchTerm}
                  onEditar={handleStartEditing}
                  onEliminar={handleDeleteProduct}
                  onToggleComplete={toggleComplete}
                  onClearAllProducts={clearAllProducts}
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
        </div> {/* END OF main-content-area */}

        {/* FIXED BOTTOM SECTION: Controls + Product Form (if visible) */}
        {currentListId && (
          <div className="fixed-bottom-controls">
            {/* These elements are always visible in the bottom bar */}
            <div className="bottom-controls-header">
              <SearchBar
                busqueda={searchTerm}
                setBusqueda={setSearchTerm}
              // REMOVED: mostrarFormulario, setMostrarFormulario, onCancelar props
              />
              {/* NEW: Button moved here */}
              <Button
                onClick={handleToggleForm}
                variant={showProductForm ? 'secondary' : 'primary'}
                icon={showProductForm ? '❌' : '➕'}
                className="toggle-form-button" // Add a class for styling if needed
              >
                {showProductForm ? 'Cancelar' : 'Agregar Producto'}
              </Button>
              <TotalSummary total={totalGeneral} />
            </div>

            {/* Product Form (conditionally rendered below the controls) */}
            {showProductForm && (
              loadingCategories ? (
                <p className="loading-message">Cargando categorías para formulario...</p>
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
      <Route path="/" element={currentUser ? <MainAppContent /> : <Navigate to="/auth" />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </Router>
  );
}

export default App;