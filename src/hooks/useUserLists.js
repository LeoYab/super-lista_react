// src/hooks/useUserLists.js
import { useState, useEffect } from 'react';
import * as firebaseService from '../services/firebaseService';
import { showSuccessToast, showErrorAlert } from '../Notifications/NotificationsServices';

// Remembers the selected list per user so a page reload reopens it instead of
// falling back to the first one. Storage can be unavailable (private mode).
const storageKey = (uid) => `superlista_current_list_${uid}`;
const readStoredListId = (uid) => {
  try { return localStorage.getItem(storageKey(uid)); } catch { return null; }
};
const storeListId = (uid, listId) => {
  try { localStorage.setItem(storageKey(uid), listId); } catch { /* ignore */ }
};

export function useUserLists(currentUser) {
  const [userLists, setUserLists] = useState([]);
  const [currentListId, setCurrentListId] = useState(null);
  const [currentListName, setCurrentListName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setUserLists([]);
      setCurrentListId(null);
      setCurrentListName('');
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = firebaseService.subscribeToUserLists(currentUser.uid, (loadedLists) => {
      setUserLists(loadedLists);
      if (loadedLists.length > 0) {
        if (!currentListId || !loadedLists.some(list => list.id === currentListId)) {
          const stored = currentListId ? null : readStoredListId(currentUser.uid);
          const target = loadedLists.find(list => list.id === stored) || loadedLists[0];
          setCurrentListId(target.id);
          setCurrentListName(target.nameList);
        }
      } else {
        setCurrentListId(null);
        setCurrentListName('');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser, currentListId]);

  useEffect(() => {
    if (currentUser && currentListId) storeListId(currentUser.uid, currentListId);
  }, [currentUser, currentListId]);

  const createList = async (listName) => {
    if (!currentUser || !listName.trim()) return;
    try {
      const newListId = await firebaseService.createList(currentUser.uid, listName);
      if (newListId) {
        setCurrentListId(newListId);
        setCurrentListName(listName.trim());
      }
      showSuccessToast(`¡Lista <strong>"${listName}"</strong> Creada!`);
    } catch (error) {
      console.error("Error al crear nueva lista:", error);
      showErrorAlert('Error', 'No se pudo crear la lista.');
    }
  };

  const deleteList = async (listIdToDelete) => {
    if (!currentUser || !listIdToDelete) return;
    try {
      await firebaseService.deleteList(currentUser.uid, listIdToDelete);
    } catch (error) {
      console.error("Error al eliminar lista:", error);
      throw new Error('Failed to delete list');
    }
  };

  const selectList = (listId) => {
    const selected = userLists.find(list => list.id === listId);
    if (selected) {
      setCurrentListId(selected.id);
      setCurrentListName(selected.nameList);
    }
  };

  const copyList = async (sourceListId, newListName) => {
    if (!currentUser || !sourceListId || !newListName.trim()) return;
    try {
      const newListId = await firebaseService.copyListWithoutPrices(currentUser.uid, sourceListId, newListName.trim());
      if (newListId) {
        setCurrentListId(newListId);
        setCurrentListName(newListName.trim());
      }
      showSuccessToast(`¡Lista copiada como <strong>"${newListName}"</strong>!`);
    } catch (error) {
      console.error("Error al copiar lista:", error);
      showErrorAlert('Error', 'No se pudo copiar la lista.');
    }
  };

  return {
    userLists,
    currentListId,
    currentListName,
    loading,
    createList,
    deleteList,
    selectList,
    copyList,
  };
}
