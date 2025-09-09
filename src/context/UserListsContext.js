import React, { createContext, useContext } from 'react';
import { useUserLists } from '../hooks/useUserLists';
import { useAuth } from './AuthContext';

const UserListsContext = createContext();

export const useUserListsContext = () => useContext(UserListsContext);

export const UserListsProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const userListsData = useUserLists(currentUser);

  return (
    <UserListsContext.Provider value={userListsData}>
      {children}
    </UserListsContext.Provider>
  );
};
