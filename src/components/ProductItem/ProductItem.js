import React, { useState, useCallback, useEffect } from 'react';
import './ProductItem.css';
import Button from '../Buttons/Button';
import { showConfirmAlert, showSuccessToast } from '../../Notifications/NotificationsServices';
// Asegúrate de que esta ruta sea correcta para tu estructura de archivos
import { useSwipeable } from '../../hooks/useSwipeable';

import { useProductsContext } from '../../context/ProductsContext';

const ProductItem = ({ producto, onEditar }) => {
  const { deleteProduct, toggleComplete } = useProductsContext();
  const itemTotal = (producto.valor || 0) * (producto.cantidad || 0);

  const formattedPrice = (producto.valor || 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const formattedTotal = itemTotal.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const ProductNameLength = 18;
  const truncatedProductName = producto.nombre.length > ProductNameLength
    ? producto.nombre.substring(0, ProductNameLength) + '...'
    : producto.nombre;

  const [isMobile, setIsMobile] = useState(false);

  // Aumentamos el umbral para que el swipe sea menos sensible y requiera más intención.
  const SWIPE_THRESHOLD = 100; // ¡Valor ajustado a 100!

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);

    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);

  // Definimos las funciones de acción directamente
  const handleConfirmDelete = useCallback(async () => {
    try {
      const isConfirmed = await showConfirmAlert({
        title: '¿Estás seguro?',
        text: `¿Quieres eliminar "${producto.nombre}" de la lista?`,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
      });

      if (isConfirmed) {
        await deleteProduct(producto.firebaseId);
        showSuccessToast(`¡Producto <strong>"${producto.nombre}"</strong> Eliminado!`);
      }
      // NO se llama a closeSwipe aquí, el hook se encarga de eso automáticamente
      // después de que la acción se dispara.
    } catch (error) {
      console.error('Error al confirmar eliminación:', error);
      // closeSwipe se llamará automáticamente por el hook
    }
  }, [producto.firebaseId, producto.nombre, deleteProduct]);

  const handleTriggerEdit = useCallback(() => {
    // NO se llama a closeSwipe aquí, el hook se encarga de eso automáticamente.
    onEditar(producto);
  }, [onEditar, producto]);

  const handleToggleComplete = useCallback(() => {
    if (toggleComplete) {
      toggleComplete(producto.firebaseId);
    }
  }, [toggleComplete, producto.firebaseId]);

  // --- Uso del hook useSwipeable ---
  const {
    wrapperProps,
    translateX,
    isDragging
  } = useSwipeable({
    swipeThreshold: SWIPE_THRESHOLD,
    onSwipeLeftAction: handleConfirmDelete, // Esta acción se disparará al soltar swipe izquierda
    onSwipeRightAction: handleTriggerEdit,  // Esta acción se disparará al soltar swipe derecha
    onCardClick: handleToggleComplete, // Esta acción se disparará al hacer clic sin swipe
  });

  // Los onClick de los botones de desktop/mobile overlays DEBEN llamar a e.stopPropagation()
  // para evitar que el click se propague al wrapperProps.onClick (handleCardClick del hook).
  const handleDesktopEditButtonClick = useCallback((e) => {
    e.stopPropagation(); // Evita que se dispare el handleCardClick del hook
    onEditar(producto);
  }, [onEditar, producto]);

  const handleDesktopDeleteButtonClick = useCallback(async (e) => {
    e.stopPropagation(); // Evita que se dispare el handleCardClick del hook
    handleConfirmDelete(); // Llama a la misma función de confirmación
  }, [handleConfirmDelete]);

  const handleMobileOverlayEditButtonClick = useCallback((e) => {
    e.stopPropagation(); // Fundamental para que el click en el botón no sea interpretado como click de tarjeta
    handleTriggerEdit(); // Llama a la misma función que el swipe
  }, [handleTriggerEdit]);

  const handleMobileOverlayDeleteButtonClick = useCallback(async (e) => {
    e.stopPropagation(); // Fundamental para que el click en el botón no sea interpretado como click de tarjeta
    handleConfirmDelete(); // Llama a la misma función que el swipe
  }, [handleConfirmDelete]);


  return (
    <div
      className="product-item-wrapper"
      // Aplicamos las props del hook aquí
      {...wrapperProps}
    >
      <div
        className={`product-item-card ${producto.completed ? 'completed' : ''} ${isDragging ? 'dragging' : ''} ${isMobile ? 'mobile' : 'desktop'}`}
        style={{ transform: `translateX(${translateX}px)` }}
      // El onClick ya se está pasando por wrapperProps, así que lo quitamos de aquí.
      // onClick={handleCardClick} // ESTO DEBE QUITARSE
      >
        {/* Left content */}
        <div className="product-item-left-content">
          <div className="product-item-image">
            <span className="emoji-icon">{producto.icon || '❓'}</span>
          </div>
          <div className="product-item-details">
            <span className="product-item-name">{truncatedProductName}</span>
            <span className="product-item-unit-detail">Precio Unitario: {formattedPrice}</span>
          </div>
        </div>

        {/* Right content - quantity and total */}
        <div className="product-item-right-content">
          <span className="product-item-quantity-text">Cantidad: {producto.cantidad}</span>
          <span className="product-item-total-price">{formattedTotal}</span>
        </div>

        {/* Desktop actions */}
        {!isMobile && (
          <div className="product-item-actions product-item-actions-desktop">
            <Button
              onClick={handleDesktopEditButtonClick}
              title="Editar producto"
              icon="✏️"
              variant="ghost"
              size="small"
            />
            <Button
              onClick={handleDesktopDeleteButtonClick}
              title="Eliminar producto"
              icon="🗑️"
              variant="danger"
              size="small"
            />
          </div>
        )}
      </div>

      {/* Mobile swipe overlays */}
      {isMobile && (
        <>
          {/* El ancho de los overlays está definido en CSS y el elemento base se desliza */}
          <div className="product-item-edit-overlay">
            <Button
              title="Editar"
              variant="primary"
              className="swipe-edit-button" // Usamos la clase específica
              onClick={handleMobileOverlayEditButtonClick} // Para poder hacer clic si no se deslizó del todo
            >
              Editar
            </Button>
          </div>
          <div className="product-item-delete-overlay">
            <Button
              title="Eliminar"
              variant="danger"
              className="swipe-delete-button" // Usamos la clase específica
              onClick={handleMobileOverlayDeleteButtonClick} // Para poder hacer clic si no se deslizó del todo
            >
              Eliminar
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default ProductItem;