import { ref, onValue, push, remove, set, update } from 'firebase/database';
import { dbRealtime } from '../firebase/config';

// --- List Management ---

export const subscribeToUserLists = (userId, callback) => {
  const userListsRef = ref(dbRealtime, `Users/${userId}/User_Lists`);
  return onValue(userListsRef, (snapshot) => {
    const data = snapshot.val();
    const loadedLists = data ? Object.entries(data).map(([key, value]) => ({
      id: key,
      nameList: value.nameList || 'Lista sin nombre',
      createdAt: value.createdAt || null,
    })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) : [];
    callback(loadedLists);
  }, (error) => {
    console.error("Error al cargar listas del usuario:", error);
    callback([]);
  });
};

export const createList = async (userId, listName) => {
  const userListsRef = ref(dbRealtime, `Users/${userId}/User_Lists`);
  const newListRef = push(userListsRef);
  await set(newListRef, {
    nameList: listName.trim(),
    createdAt: Date.now(),
  });
};

export const deleteList = (userId, listId) => {
  const listRefToDelete = ref(dbRealtime, `Users/${userId}/User_Lists/${listId}`);
  return remove(listRefToDelete);
};

// --- Product Management ---

export const subscribeToProducts = (userId, listId, callback) => {
  const productsRef = ref(dbRealtime, `Users/${userId}/User_Lists/${listId}/products`);
  return onValue(productsRef, (snapshot) => {
    const data = snapshot.val();
    const loadedProducts = data ? Object.entries(data).map(([key, value]) => ({
      firebaseId: key,
      nombre: value.nameProd,
      valor: value.price,
      cantidad: value.quantity,
      category: value.category,
      icon: value.icon,
      completed: value.completed || false,
    })) : [];
    callback(loadedProducts);
  }, (error) => {
    console.error("Error al cargar productos:", error);
    callback([]);
  });
};

export const addProduct = (userId, listId, productData) => {
  const productsRef = ref(dbRealtime, `Users/${userId}/User_Lists/${listId}/products`);
  return push(productsRef, {
    nameProd: productData.nombre,
    price: parseFloat(productData.valor),
    quantity: parseInt(productData.cantidad),
    completed: false,
    category: productData.category,
    icon: productData.icon,
  });
};

export const editProduct = (userId, listId, productId, productData) => {
  const productRef = ref(dbRealtime, `Users/${userId}/User_Lists/${listId}/products/${productId}`);
  return update(productRef, {
    nameProd: productData.nombre,
    price: parseFloat(productData.valor),
    quantity: parseInt(productData.cantidad),
    category: productData.category,
    icon: productData.icon,
  });
};

export const deleteProduct = (userId, listId, productId) => {
  const productRef = ref(dbRealtime, `Users/${userId}/User_Lists/${listId}/products/${productId}`);
  return remove(productRef);
};

export const toggleProductComplete = (userId, listId, productId, completed) => {
  const productRef = ref(dbRealtime, `Users/${userId}/User_Lists/${listId}/products/${productId}`);
  return update(productRef, { completed });
};

export const clearAllProducts = (userId, listId) => {
  const productsRef = ref(dbRealtime, `Users/${userId}/User_Lists/${listId}/products`);
  return set(productsRef, null);
};

// --- Category Management ---

export const subscribeToCategories = (callback) => {
    const categoriesRef = ref(dbRealtime, 'Categories');
    return onValue(categoriesRef, (snapshot) => {
        const data = snapshot.val();
        const loadedCategories = data ? Object.values(data) : [];
        callback(loadedCategories);
    }, (error) => {
        console.error("Error al cargar categorías:", error);
        callback([]);
    });
};
