import { ref, onValue, push, remove, set, update, get } from 'firebase/database';
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
  return newListRef.key;
};

export const deleteList = (userId, listId) => {
  const listRefToDelete = ref(dbRealtime, `Users/${userId}/User_Lists/${listId}`);
  return remove(listRefToDelete);
};

export const copyListWithoutPrices = async (userId, sourceListId, newListName) => {
  const newListId = await createList(userId, newListName);
  const sourceProductsRef = ref(dbRealtime, `Users/${userId}/User_Lists/${sourceListId}/products`);
  const snapshot = await get(sourceProductsRef);
  const data = snapshot.val();

  if (data) {
    const newProductsRef = ref(dbRealtime, `Users/${userId}/User_Lists/${newListId}/products`);
    for (const value of Object.values(data)) {
      const newProductRef = push(newProductsRef);
      await set(newProductRef, {
        nameProd: value.nameProd,
        price: 0,
        quantity: value.quantity || 1,
        completed: false,
        category: value.category,
        icon: value.icon,
        originalPrice: null,
        promoLegend: null,
        supermarket: null
      });
    }
  }
  return newListId;
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
      precio_original: value.originalPrice || null,
      promo_leyenda: value.promoLegend || null,
      supermercado: value.supermarket || null,
      promo_cantidad: value.promoQuantity || null,
      valor_unitario_base: value.unitPriceBase || null,
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
    originalPrice: productData.precio_original || null,
    promoLegend: productData.promo_leyenda || null,
    supermarket: productData.supermercado || null,
    promoQuantity: productData.promo_cantidad || null,
    unitPriceBase: productData.valor_unitario_base || null,
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
    originalPrice: productData.precio_original || null,
    promoLegend: productData.promo_leyenda || null,
    promoQuantity: productData.promo_cantidad || null,
    unitPriceBase: productData.valor_unitario_base || null,
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
    const loadedCategories = data
      ? Object.values(data).sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      : [];
    callback(loadedCategories);
  }, (error) => {
    console.error("Error al cargar categorías:", error);
    callback([]);
  });
};

export const addCategory = async (categoryData) => {
  const categoriesRef = ref(dbRealtime, 'Categories');
  const snapshot = await get(categoriesRef);
  const data = snapshot.val();
  
  let nextId = 1;
  let nextOrder = 1;
  
  if (data) {
    const list = Object.values(data);
    const maxId = Math.max(...list.map(c => Number(c.id) || 0), 0);
    nextId = maxId + 1;
    const maxOrder = Math.max(...list.map(c => Number(c.order) || 0), 0);
    nextOrder = maxOrder + 1;
  }
  
  const newCatRef = ref(dbRealtime, `Categories/${nextId}`);
  const newCat = {
    id: nextId,
    title: categoryData.title,
    icon: categoryData.icon || '🛒',
    icons: categoryData.icons || [categoryData.icon || '🛒'],
    order: nextOrder
  };
  
  await set(newCatRef, newCat);
  return newCat;
};
