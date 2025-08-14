// src/hooks/useProducts.js
import { useState, useEffect } from 'react';
import * as firebaseService from '../services/firebaseService';
import { showSuccessToast, showSuccessAlert, showErrorAlert, showConfirmAlert } from '../Notifications/NotificationsServices';

export function useProducts(currentUser, currentListId) {
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  useEffect(() => {
    if (!currentUser || !currentListId) {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }

    setLoadingProducts(true);
    const unsubscribe = firebaseService.subscribeToProducts(currentUser.uid, currentListId, (loadedProducts) => {
      setProducts(loadedProducts);
      setLoadingProducts(false);
    });

    return () => unsubscribe();
  }, [currentUser, currentListId]);

  const addProduct = async (productData) => {
    if (!currentUser || !currentListId) return;
    try {
      await firebaseService.addProduct(currentUser.uid, currentListId, productData);
      showSuccessToast(`¡Producto <strong>"${productData.nombre}"</strong> Añadido!`);
    } catch (error) {
      console.error("Error al añadir producto:", error);
      showErrorAlert('Error', 'No se pudo añadir el producto.');
    }
  };

  const editProduct = async (firebaseId, productData) => {
    if (!currentUser || !currentListId) return;
    try {
      await firebaseService.editProduct(currentUser.uid, currentListId, firebaseId, productData);
      showSuccessAlert('¡Producto Actualizado!');
    } catch (error) {
      console.error("Error al actualizar producto:", error);
      showErrorAlert('Error', 'No se pudo actualizar el producto.');
    }
  };

  const deleteProduct = async (firebaseId) => {
    if (!currentUser || !currentListId) return;
    try {
      await firebaseService.deleteProduct(currentUser.uid, currentListId, firebaseId);
      // Success toast is handled in ProductItem's confirmDelete
    } catch (error) {
      console.error("Error al eliminar producto:", error);
      showErrorAlert('Error', 'No se pudo eliminar el producto.');
    }
  };

  const toggleComplete = async (firebaseId) => {
    if (!currentUser || !currentListId) return;
    try {
      const productToUpdate = products.find(p => p.firebaseId === firebaseId);
      if (productToUpdate) {
        await firebaseService.toggleProductComplete(currentUser.uid, currentListId, firebaseId, !productToUpdate.completed);
      }
    } catch (error) {
      console.error("Error al actualizar estado de completado:", error);
    }
  };

  const clearAllProducts = async (listName) => {
    if (!currentUser || !currentListId) return;
    const isConfirmed = await showConfirmAlert({
      title: '¿Estás seguro?',
      text: `¿Quieres vaciar todos los productos de "${listName}"?`,
      confirmButtonText: 'Sí, vaciar',
      cancelButtonText: 'Cancelar',
    });

    if (isConfirmed) {
      try {
        await firebaseService.clearAllProducts(currentUser.uid, currentListId);
        showSuccessAlert('¡Lista Vaciada!', 'Todos los productos han sido eliminados.');
      } catch (error) {
        console.error("Error al vaciar la lista:", error);
        showErrorAlert('Error', 'No se pudo vaciar la lista.');
      }
    }
  };

  return {
    products,
    loadingProducts,
    addProduct,
    editProduct,
    deleteProduct,
    toggleComplete,
    clearAllProducts,
  };
}
