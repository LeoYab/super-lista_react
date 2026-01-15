// src/hooks/useUserLists.js
import { useState, useEffect } from 'react';
import * as firebaseService from '../services/firebaseService';
import { showSuccessToast, showErrorAlert } from '../Notifications/NotificationsServices';

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
          setCurrentListId(loadedLists[0].id);
          setCurrentListName(loadedLists[0].nameList);
        }
      } else {
        setCurrentListId(null);
        setCurrentListName('');
      }
      setLoading(false);
    });

    return () => unsubscribe();
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

  return {
    userLists,
    currentListId,
    currentListName,
    loading,
    createList,
    deleteList,
    selectList,
  };
}
