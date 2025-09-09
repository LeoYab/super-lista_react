import React, { createContext, useContext } from 'react';
import { useProducts } from '../hooks/useProducts';
import { useAuth } from './AuthContext';
import { useUserListsContext } from './UserListsContext';

const ProductsContext = createContext();

export const useProductsContext = () => useContext(ProductsContext);

export const ProductsProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const { currentListId } = useUserListsContext();
  const productsData = useProducts(currentUser, currentListId);

  return (
    <ProductsContext.Provider value={productsData}>
      {children}
    </ProductsContext.Provider>
  );
};
