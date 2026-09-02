// src/components/SidebarMenu/SidebarMenu.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // <--- IMPORTA useNavigate
import { LogOut, Store } from 'lucide-react';
import './SidebarMenu.css';
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
  const navigate = useNavigate(); // <--- INICIALIZA useNavigate

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

  // NUEVA FUNCIÓN para navegar a la página de supermercados
  const handleGoToSupermercados = () => {
    navigate('/supermercados'); // Redirige a la ruta /supermercados
    setIsMenuOpen(false); // Cierra el menú después de navegar
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
          {currentUser && (
            <p className="user-email-display">
              Bienvenido, <br />
              <strong>{currentUser.email}</strong>
            </p>
          )}
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
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
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
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* NUEVA SECCIÓN: Enlaces adicionales */}
        <div className="menu-section additional-links">
          <h4>Otras Secciones</h4>
          <ul>
            <li className="list-item" onClick={handleGoToSupermercados}>
              <Store size={16} /> Explorar Supermercados
            </li>
            {/* Puedes agregar más enlaces aquí si los necesitas */}
          </ul>
        </div>

      </div >
    </>
  );
};

export default SidebarMenu;