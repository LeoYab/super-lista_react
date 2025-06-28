// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, AuthProvider } from './context/AuthContext';
import { db } from './firebase/config';
import { ref, onValue, push, remove, update, set } from 'firebase/database';

// Importa tus componentes y estilos
import Header from './components/Header/Header';
import ProductForm from './components/ProductForm/ProductForm';
import ProductList from './components/ProductList/ProductList';
import AuthPage from './pages/AuthPage/AuthPage';
import SidebarMenu from './components/SidebarMenu/SidebarMenu'; // Importa el nuevo componente

import './App.css';
import './components/Header/Header.css';
import './components/ProductForm/ProductForm.css';
import './components/ProductList/ProductList.css';
import './components/ProductItem/ProductItem.css';
import './pages/AuthPage/AuthPage.css';
import './components/SidebarMenu/SidebarMenu.css'; // Importa el nuevo CSS del menú


function MainAppContent() {
  const { currentUser, logout } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // Nuevos estados para la gestión de listas
  const [userLists, setUserLists] = useState([]); // Array de {id, nameList, createdAt}
  const [currentListId, setCurrentListId] = useState(null); // ID de la lista actualmente activa

  // Estados para la funcionalidad de edición de productos
  const [editandoId, setEditandoId] = useState(null);
  const [productoAEditar, setProductoAEditar] = useState(null);

  // Referencias de Firebase para listas y categorías
  const userListsRef = currentUser ? ref(db, `Users/${currentUser.uid}/User_Lists`) : null;
  const categoriesRef = ref(db, 'Categories');

  // Efecto para cargar categorías (se mantiene igual)
  useEffect(() => {
    setLoadingCategories(true);
    const unsubscribe = onValue(categoriesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setCategories(Object.values(data));
      } else {
        setCategories([]);
      }
      setLoadingCategories(false);
    }, (error) => {
      console.error("Error al cargar categorías:", error);
      setLoadingCategories(false);
    });
    return () => unsubscribe();
  }, []);

  // Nuevo efecto: Carga las listas del usuario y establece una por defecto si no hay
  useEffect(() => {
    if (!currentUser) {
      setUserLists([]);
      setCurrentListId(null);
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
            createdAt: data[key].createdAt || null // Asegurarse de que createdAt exista
          });
        }
        // Ordenar listas por fecha de creación (más reciente primero)
        loadedLists.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      }
      setUserLists(loadedLists);

      // Si hay listas cargadas y no hay una lista actual seleccionada
      // o la lista actual no existe, selecciona la primera.
      if (loadedLists.length > 0 && (!currentListId || !loadedLists.some(list => list.id === currentListId))) {
        setCurrentListId(loadedLists[0].id);
      } else if (loadedLists.length === 0) {
        // Si no existen listas, crea una por defecto
        // NOTA: Esto se ejecutará solo una vez al inicio si el usuario no tiene listas.
        // Si el usuario borra todas las listas, deberá crear una manualmente.
        // createList("Mi Primera Lista"); // Descomentar si quieres que siempre cree una por defecto
      }
    }, (error) => {
      console.error("Error al cargar listas del usuario:", error);
    });

    return () => unsubscribe();
  }, [currentUser, userListsRef, currentListId]);

  // Efecto para cargar productos, ahora depende de currentListId
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

  // FUNCIÓN ACTUALIZADA: Para crear una nueva lista con nameList y createdAt
  const createList = async (listName) => {
    if (!currentUser || !listName.trim()) return;

    try {
      const newListRef = push(userListsRef);
      await set(newListRef, {
        nameList: listName.trim(), // Asegura que se usa el nombre del input
        createdAt: Date.now()      // Añade la marca de tiempo de creación
      });
      setCurrentListId(newListRef.key); // Selecciona automáticamente la nueva lista
    } catch (error) {
      console.error("Error al crear nueva lista:", error);
    }
  };

  // NUEVA FUNCIÓN: Para eliminar una lista
  const deleteList = async (listIdToDelete) => {
    if (!currentUser || !listIdToDelete) return;

    try {
      const listRefToDelete = ref(db, `Users/${currentUser.uid}/User_Lists/${listIdToDelete}`);
      await remove(listRefToDelete);

      // Después de eliminar, si la lista eliminada era la actual,
      // intenta seleccionar la primera lista restante o ninguna si no hay más.
      if (listIdToDelete === currentListId) {
        const remainingLists = userLists.filter(list => list.id !== listIdToDelete);
        if (remainingLists.length > 0) {
          setCurrentListId(remainingLists[0].id);
        } else {
          setCurrentListId(null); // No hay listas restantes
        }
      }
    } catch (error) {
      console.error("Error al eliminar lista:", error);
    }
  };


  // NUEVA FUNCIÓN: Para seleccionar una lista existente
  const selectList = (listId) => {
    setCurrentListId(listId);
    setEditandoId(null); // Reinicia el estado de edición al cambiar de lista
    setProductoAEditar(null);
  };

  // Funciones de Firebase existentes, actualizadas para usar currentListId
  const onAgregar = async (productoDataFormulario) => {
    if (!currentUser || !currentListId) return;
    try {
      const productsRef = ref(db, `Users/${currentUser.uid}/User_Lists/${currentListId}/products`);
      const newProductRef = push(productsRef);
      await set(newProductRef, {
        nameProd: productoDataFormulario.nombre,
        price: parseFloat(productoDataFormulario.valor),
        quantity: parseInt(productoDataFormulario.cantidad),
        completed: false,
        category: productoDataFormulario.category,
        icon: productoDataFormulario.icon,
        id: Date.now(),
      });
    } catch (error) {
      console.error("Error al añadir producto:", error);
    }
  };

  const onEditar = async (idFirebase, productoDataFormulario) => {
    if (!currentUser || !currentListId) return;
    try {
      const productRef = ref(db, `Users/${currentUser.uid}/User_Lists/${currentListId}/products/${idFirebase}`);
      await update(productRef, {
        nameProd: productoDataFormulario.nombre,
        price: parseFloat(productoDataFormulario.valor),
        quantity: parseInt(productoDataFormulario.cantidad),
        category: productoDataFormulario.category,
        icon: productoDataFormulario.icon,
      });
      setEditandoId(null);
      setProductoAEditar(null);
    } catch (error) {
      console.error("Error al actualizar producto:", error);
    }
  };

  const iniciarEdicion = (producto) => {
    setEditandoId(producto.firebaseId);
    setProductoAEditar(producto);
  };

  const onCancelar = () => {
    setEditandoId(null);
    setProductoAEditar(null);
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

  const deleteProduct = async (firebaseId) => {
    if (!currentUser || !currentListId) return;
    try {
      const productRef = ref(db, `Users/${currentUser.uid}/User_Lists/${currentListId}/products/${firebaseId}`);
      await remove(productRef);
    } catch (error) {
      console.error("Error al eliminar producto:", error);
    }
  };

  const clearProducts = async () => {
    if (!currentUser || !currentListId) return;
    try {
      const productsRef = ref(db, `Users/${currentUser.uid}/User_Lists/${currentListId}/products`);
      await remove(productsRef);
    } catch (error) {
      console.error("Error al vaciar la lista:", error);
    }
  };

  return (
    <div className="App">
      <Header />
      <div className="container">
        {/* Componente del menú lateral */}
        <SidebarMenu
          currentUser={currentUser}
          logout={logout}
          userLists={userLists}
          createList={createList}
          selectList={selectList}
          currentListId={currentListId}
          deleteList={deleteList} // Pasa la nueva función para eliminar listas
        />

        {/* Renderiza el contenido principal solo si una lista está seleccionada */}
        {currentListId ? (
          <>
            {/* Muestra el nombre de la lista actual */}
            <h3 className="current-list-title">
               <strong>Nombre de lista: </strong>
                {userLists.find(list => list.id === currentListId)?.nameList || 'Cargando Lista...'}
            </h3>

            {/* Formulario de producto */}
            {loadingCategories ? (
              <p>Cargando categorías para formulario...</p>
            ) : (
              <ProductForm
                editandoId={editandoId}
                productoAEditar={productoAEditar}
                onAgregar={onAgregar}
                onEditar={onEditar}
                onCancelar={onCancelar}
                categories={categories}
              />
            )}

            {/* Lista de productos */}
            {loadingProducts ? (
              <p>Cargando lista...</p>
            ) : (
              <ProductList
                productos={products}
                busqueda={''}
                onEditar={iniciarEdicion}
                onEliminar={deleteProduct}
                onToggleComplete={toggleComplete}
                onClearProducts={clearProducts}
              />
            )}
          </>
        ) : (
          <div className="empty-state">
             <div className="empty-icon">📂</div>
             <h3 className="empty-title">Crea o selecciona una lista</h3>
             <p className="empty-description">Usa el botón de menú (☰) en la esquina superior izquierda para gestionar tus listas.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Componente para manejar las rutas y la autenticación
function AppRouter() {
  const { currentUser } = useAuth();

  // Muestra un loader o spinner mientras el estado de autenticación se está cargando
  if (typeof currentUser === 'undefined') {
    return <div className="loading-auth">Cargando usuario...</div>; // O un spinner
  }

  return (
    <Routes>
      <Route path="/auth" element={currentUser ? <Navigate to="/" /> : <AuthPage />} />
      <Route path="/" element={currentUser ? <MainAppContent /> : <Navigate to="/auth" />} />
    </Routes>
  );
}

// Componente principal de la aplicación
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