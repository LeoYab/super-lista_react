// src/components/SidebarMenu/SidebarMenu.js
import React, { useState } from 'react';
import { LogOut, Sun, Moon, Copy, Trash2 } from 'lucide-react';
import './SidebarMenu.css';
import { useTheme } from '../../hooks/useTheme';
// REMOVED: import Swal from 'sweetalert2'; // ¡Eliminamos esta importación!

// IMPORT NEW SERVICE: Importa tus funciones de notificación
import { showConfirmAlert, showSuccessToast, showErrorAlert, showInputAlert } from '../../Notifications/NotificationsServices';
import { useAuth } from '../../context/AuthContext';
import { useUserListsContext } from '../../context/UserListsContext';

// Importa tus componentes Button e Input
import Button from '../Buttons/Button';
import Input from '../Input/Input';

// Función auxiliar para formatear la fecha
const formatDate = (timestamp) => {
  if (!timestamp) return 'Fecha desconocida';
  // Verifica si el timestamp es un objeto de Firebase Timestamp
  if (timestamp && typeof timestamp.toDate === 'function') {
    const date = timestamp.toDate();
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
  // Si es un número o una cadena de fecha estándar
  const date = new Date(timestamp);
  return date.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const SidebarMenu = () => {
  const { currentUser, logout } = useAuth();
  const { userLists, createList, selectList, currentListId, deleteList, copyList } = useUserListsContext();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const { theme, toggleTheme } = useTheme();

  const handleCreateList = () => {
    if (newListName.trim()) {
      createList(newListName.trim());
      setNewListName('');
      setIsMenuOpen(false); // Cierra el menú al crear una lista
    }
  };

  const handleCopyList = async (listId, listName) => {
    const newListName = await showInputAlert({
      title: 'Copiar Lista (Sin Precios)',
      inputPlaceholder: 'Ej: Lista Semanal de Congelados',
      inputValue: `Copia de ${listName}`,
      confirmButtonText: 'Copiar',
      cancelButtonText: 'Cancelar'
    });

    if (newListName) {
      await copyList(listId, newListName);
      setIsMenuOpen(false);
    }
  };

  // Función de confirmación para eliminar una lista usando SweetAlert2
  const handleDeleteListConfirm = async (listId, listName) => { // Made async
    const isConfirmed = await showConfirmAlert({ // Replaced Swal.fire
      title: '¿Estás seguro?',
      text: `¿Quieres eliminar la lista "${listName}"? Esta acción no se puede deshacer.`,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (isConfirmed) {
      try {
        await deleteList(listId);
        showSuccessToast(`¡Lista <strong>"${listName}"</strong> Eliminada!`); // Replaced Swal.fire
      } catch (error) {
        console.error("Error al eliminar la lista:", error);
        showErrorAlert('Error', 'No se pudo eliminar la lista.'); // Replaced Swal.fire
      }
    }
  };

  return (
    <>
      {/* Botón para abrir/cerrar el menú */}
      <Button
        className="menu-toggle-button round"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        variant="primary"
        title={isMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
      >
        <div className={`hamburger-icon ${isMenuOpen ? 'open' : ''}`}>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </Button>

      {/* Overlay para cerrar el menú al hacer clic fuera de él */}
      {isMenuOpen && <div className="menu-overlay" onClick={() => setIsMenuOpen(false)}></div>}

      {/* El menú lateral en sí */}
      <div className={`sidebar-menu ${isMenuOpen ? 'open' : ''}`}>
        <div className="menu-header">
          <div className="menu-header-top">
            <span className="menu-header-greeting">Bienvenido</span>
            <div className="menu-header-actions">
              <Button
                onClick={toggleTheme}
                variant="ghost"
                size="small"
                title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                icon={theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              />
              {/* Botón de Cerrar Sesión (ahora un componente Button) */}
              <Button
                className="logout-button-menu"
                onClick={logout}
                variant="ghost"
                size="small"
                title="Cerrar sesión"
                icon={<LogOut size={16} />}
              />
            </div>
          </div>
          {currentUser && (
            <p className="user-email-display">{currentUser.email}</p>
          )}
        </div>

        <div className="menu-section">
          <h4>Crear Nueva Lista</h4>
          <div className="create-list-section" style={{ marginBottom: '20px' }}>
            <Input
              id="newListName"
              name="newListName"
              type="text"
              placeholder="Nombre de lista..."
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyPress={(e) => { if (e.key === 'Enter') handleCreateList(); }}
            />
            <Button onClick={handleCreateList} variant="success">Crear</Button>
          </div>

          <h4>Tus Listas</h4>
          <ul className="list-names">
            {userLists.length === 0 ? (
              <li className="no-lists-message">No tienes listas.</li>
            ) : (
              userLists.map(list => (
                <li
                  key={list.id}
                  className={`list-item ${list.id === currentListId ? 'active' : ''}`}
                >
                  <span onClick={() => {
                    selectList(list.id);
                    setIsMenuOpen(false); // Cierra el menú al seleccionar una lista
                  }}>
                    {list.nameList}
                    <br />
                    <span className="list-date">Creada: {formatDate(list.createdAt)}</span>
                  </span>
                  <div className="list-item-actions">
                    <Button
                      className="copy-list-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyList(list.id, list.nameList);
                      }}
                      title={`Copiar lista "${list.nameList}" (sin precios)`}
                      variant="ghost"
                      size="small"
                    >
                      <Copy size={15} strokeWidth={2.5} />
                    </Button>
                    <Button
                      className="delete-list-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteListConfirm(list.id, list.nameList);
                      }}
                      title={`Eliminar lista "${list.nameList}"`}
                      variant="ghost"
                      size="small"
                    >
                      <Trash2 size={15} strokeWidth={2.5} />
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* NUEVA SECCIÓN: Enlaces adicionales */}
      </div >
    </>
  );
};

export default SidebarMenu;