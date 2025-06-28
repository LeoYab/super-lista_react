// src/components/SidebarMenu/SidebarMenu.js
import React, { useState } from 'react';
import './SidebarMenu.css';

// Función auxiliar para formatear la fecha
const formatDate = (timestamp) => {
  if (!timestamp) return 'Fecha desconocida';
  const date = new Date(timestamp);
  return date.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const SidebarMenu = ({ currentUser, logout, userLists, createList, selectList, currentListId, deleteList }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [newListName, setNewListName] = useState('');

  const handleCreateList = () => {
    if (newListName.trim()) {
      createList(newListName.trim());
      setNewListName('');
      setIsMenuOpen(false);
    }
  };

  const handleDeleteList = (listId, listName) => {
    if (window.confirm(`¿Estás seguro de que quieres eliminar la lista "${listName}"? Esta acción no se puede deshacer.`)) {
      deleteList(listId);
    }
  };

  return (
    <>
      {/* Botón para abrir/cerrar el menú */}
      <button className="menu-toggle-button" onClick={() => setIsMenuOpen(!isMenuOpen)}>
        {isMenuOpen ? '✖️' : '☰'}
      </button>

      {/* Overlay para cerrar el menú al hacer clic fuera */}
      {isMenuOpen && <div className="menu-overlay" onClick={() => setIsMenuOpen(false)}></div>}

      {/* El menú lateral */}
      <div className={`sidebar-menu ${isMenuOpen ? 'open' : ''}`}>
        <div className="menu-header">
          {currentUser && (
            <p className="user-email-display">
              Bienvenido, <br />
              <strong>{currentUser.email}</strong>
            </p>
          )}
          <button className="logout-button-menu" onClick={logout}>Cerrar Sesión</button>
        </div>

        <div className="menu-section">
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
                    setIsMenuOpen(false);
                  }}>
                    {list.nameList}
                    {/* Añade la fecha de creación aquí */}
                    <br />
                    <span className="list-date">Creada: {formatDate(list.createdAt)}</span>
                  </span>
                  {/* Botón de eliminar lista */}
                  <button
                    className="delete-list-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteList(list.id, list.nameList);
                    }}
                    title={`Eliminar lista "${list.nameList}"`}
                  >
                    🗑️
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="create-list-section">
            <input
              type="text"
              placeholder="Nombre de nueva lista..."
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyPress={(e) => { if (e.key === 'Enter') handleCreateList(); }}
            />
            <button onClick={handleCreateList}>Crear Lista</button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SidebarMenu;