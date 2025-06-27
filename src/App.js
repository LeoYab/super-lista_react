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

import './App.css';
import './components/Header/Header.css';
import './components/ProductForm/ProductForm.css';
import './components/ProductList/ProductList.css';
import './components/ProductItem/ProductItem.css';
import './pages/AuthPage/AuthPage.css';


function MainAppContent() {
  const { currentUser, logout } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // Estados para la funcionalidad de edición
  const [editandoId, setEditandoId] = useState(null);
  const [productoAEditar, setProductoAEditar] = useState(null);

  const userProductsRef = currentUser ?
    ref(db, `Users/${currentUser.uid}/List_Products`) : null;
  const categoriesRef = ref(db, 'Categories');

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

  useEffect(() => {
    if (!currentUser) {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }

    setLoadingProducts(true);
    const unsubscribe = onValue(userProductsRef, (snapshot) => {
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
  }, [currentUser]);

  const onAgregar = async (productoDataFormulario) => {
    if (!currentUser) return;

    try {
      const newProductRef = push(userProductsRef);
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
    if (!currentUser) return;

    try {
      const productRef = ref(db, `Users/${currentUser.uid}/List_Products/${idFirebase}`);
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
    if (!currentUser) return;

    try {
      const productRef = ref(db, `Users/${currentUser.uid}/List_Products/${firebaseId}`);
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
    if (!currentUser) return;

    try {
      const productRef = ref(db, `Users/${currentUser.uid}/List_Products/${firebaseId}`);
      await remove(productRef);
    } catch (error) {
      console.error("Error al eliminar producto:", error);
    }
  };

  const clearProducts = async () => {
    if (!currentUser) return;

    try {
      await remove(userProductsRef);
    } catch (error) {
      console.error("Error al vaciar la lista:", error);
    }
  };

  return (
    <div className="App">
      <Header />
      <div className="container">
        {currentUser && <p className="user-info">Hola, {currentUser.email}!</p>}
        <button className="logout-button" onClick={logout}>Cerrar Sesión</button>

        {/* Renderiza ProductForm */}
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

        {/* Renderiza ProductList */}
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
      </div>
    </div>
  );
}

// Componente para manejar las rutas y la autenticación
function AppRouter() {
  const { currentUser } = useAuth();

  return (
    <Routes>
      <Route path="/auth" element={currentUser ? <Navigate to="/" /> : <AuthPage />} />
      <Route path="/" element={currentUser ? <MainAppContent /> : <Navigate to="/auth" />} />
      {/* Si tienes otras rutas, agrégalas aquí */}
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