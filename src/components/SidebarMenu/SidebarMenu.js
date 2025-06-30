import React, { useState } from 'react';
import './SidebarMenu.css';
import Swal from 'sweetalert2'; // Asegúrate de tener SweetAlert2 instalado

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

const SidebarMenu = ({ currentUser, logout, userLists, createList, selectList, currentListId, deleteList }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [newListName, setNewListName] = useState('');

  const handleCreateList = () => {
    if (newListName.trim()) {
      createList(newListName.trim());
      setNewListName('');
      setIsMenuOpen(false); // Cierra el menú al crear una lista
    }
  };

  // Función de confirmación para eliminar una lista usando SweetAlert2
  const handleDeleteListConfirm = (listId, listName) => {
  Swal.fire({
    title: '¿Estás seguro?',
    text: `¿Quieres eliminar la lista "${listName}"? Esta acción no se puede deshacer.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33', // Rojo para confirmar (peligro)
    cancelButtonColor: '#3085d6', // Azul para cancelar
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  }).then(async (result) => { // Añadimos 'async' aquí porque 'deleteList' podría ser asíncrona
    if (result.isConfirmed) {
      try {
        await deleteList(listId); // Asegúrate de que 'deleteList' se resuelva antes de mostrar el toast

        // --- ¡AQUÍ ESTÁ EL CAMBIO CLAVE PARA EL TOAST! ---
        Swal.fire({
          title: '¡Lista Eliminada!',
          icon: 'success',
          showConfirmButton: false, // <-- ¡Importante! Oculta el botón "OK"
          timer: 1500,              // <-- ¡Importante! Cierra automáticamente después de 1.5 segundos
          toast: true,              // <-- ¡Importante! Activa el estilo de notificación pequeña
          position: 'top-end'       // <-- Posiciona el toast en la esquina superior derecha
        });
        // --- FIN DEL CAMBIO CLAVE ---

      } catch (error) {
        console.error("Error al eliminar la lista:", error);
        // Si 'deleteList' falla, mostrar un SweetAlert de error normal
        Swal.fire('Error', 'No se pudo eliminar la lista.', 'error');
      }
    }
  });
};

  return (
    <>
      {/* Botón para abrir/cerrar el menú (ahora un componente Button) */}
      <Button
        className="menu-toggle-button round" // Añade 'round' si quieres que sea circular
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        icon={isMenuOpen ? 'X' : '☰'} // Icono dinámico para abrir/cerrar
        variant="primary" // O el que mejor se adapte a tu diseño
        title={isMenuOpen ? 'Cerrar menú' : 'Abrir menú'} // Tooltip
      />

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
          <Button className="logout-button-menu" onClick={logout} variant="danger">
            Cerrar Sesión
          </Button>
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
                    setIsMenuOpen(false); // Cierra el menú al seleccionar una lista
                  }}>
                    {list.nameList}
                    <br />
                    <span className="list-date">Creada: {formatDate(list.createdAt)}</span>
                  </span>
                  {/* Botón de eliminar lista (ahora un componente Button) */}
                  <Button
                    className="delete-list-button round" // Clase para estilos y 'round' para circular
                    onClick={(e) => {
                      e.stopPropagation(); // Evita que el clic en el botón active el selectList de la <li>
                      handleDeleteListConfirm(list.id, list.nameList); // Llama a la confirmación de SweetAlert2
                    }}
                    title={`Eliminar lista "${list.nameList}"`}
                    icon="🗑️" // Ícono de papelera
                    variant="danger" // Estilo rojo para peligro
                    size="small" // Tamaño pequeño
                  />
                </li>
              ))
            )}
          </ul>
          <div className="create-list-section">
            {/* Input para el nombre de la nueva lista (ahora un componente Input) */}
            <Input
              type="text"
              placeholder="Nombre de nueva lista..."
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              // Maneja la creación al presionar Enter en el input
              onKeyPress={(e) => { if (e.key === 'Enter') handleCreateList(); }}
            />
            {/* Botón para crear lista (ahora un componente Button) */}
            <Button onClick={handleCreateList} variant="success">Crear</Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SidebarMenu;