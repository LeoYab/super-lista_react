// src/components/ProductItem/ProductItem.js
import React, { useState, useRef, useCallback, useEffect } from 'react';
import './ProductItem.css';
import Button from '../Buttons/Button';
import { showConfirmAlert, showSuccessToast } from '../../Notifications/NotificationsServices';

const ProductItem = ({ producto, onEditar, onEliminar, onToggleComplete }) => {
  const itemTotal = (producto.valor || 0) * (producto.cantidad || 0);

  // Asegúrate de que formattedPrice y formattedTotal tengan 2 decimales si lo deseas,
  // ya que tu código previo eliminó `minimumFractionDigits` y `maximumFractionDigits`.
  // Los he añadido de nuevo para mantener la consistencia con el uso anterior.
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

  // --- MODIFICACIÓN SOLICITADA ---
  const ProductNameLength = 18; // Constante para la longitud máxima del nombre
  const truncatedProductName = producto.nombre.length > ProductNameLength
    ? producto.nombre.substring(0, ProductNameLength) + '...'
    : producto.nombre;
  // --- FIN MODIFICACIÓN SOLICITADA ---

  const itemRef = useRef(null);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);
  const [isMobile, setIsMobile] = useState(false);

  const SWIPE_THRESHOLD = 90; // This is the distance to reveal the full button

  // Detect if it's a mobile device (based on window width)
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

  const closeSwipe = useCallback(() => {
    setTranslateX(0);
  }, []);

  const confirmDelete = useCallback(async () => {
    try {
      const isConfirmed = await showConfirmAlert({
        title: '¿Estás seguro?',
        text: `¿Quieres eliminar "${producto.nombre}" de la lista?`,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
      });

      if (isConfirmed) {
        await onEliminar(producto.firebaseId);
        showSuccessToast(`¡Producto <strong>"${producto.nombre}"</strong> Eliminado!`);
      } else {
        closeSwipe(); // Close swipe if user cancels
      }
    } catch (error) {
      console.error('Error al confirmar eliminación:', error);
      closeSwipe(); // Close swipe on error
    }
  }, [producto.firebaseId, producto.nombre, onEliminar, closeSwipe]);

  const triggerEdit = useCallback(() => {
    closeSwipe(); // Close swipe before editing
    onEditar(producto);
  }, [closeSwipe, onEditar, producto]);

  // Unified function to get the event's X coordinate
  const getClientX = useCallback((e) => {
    if (e.touches && e.touches.length > 0) {
      return e.touches[0].clientX;
    }
    return e.clientX;
  }, []);

  const handleStart = useCallback((e) => {
    if (!isMobile || e.target.closest('.product-item-actions')) {
      return;
    }
    
    if (e.button === 2) {
      return;
    }

    setIsDragging(true);
    startX.current = getClientX(e);
    currentX.current = startX.current;
    
    if (itemRef.current && e.pointerId !== undefined) {
      try {
        itemRef.current.setPointerCapture(e.pointerId);
      } catch (err) {
        // Fallback
      }
    }
    
    e.preventDefault(); 
  }, [isMobile, getClientX]);

  const handleMove = useCallback((e) => {
    if (!isDragging) return;

    currentX.current = getClientX(e);
    const deltaX = currentX.current - startX.current;
    
    // Allow more "pull" beyond the threshold to make the button fully visible
    // and also allow for "bounce" effect.
    const maxSwipeRight = SWIPE_THRESHOLD * 1.2; // Max distance to swipe right
    const maxSwipeLeft = -SWIPE_THRESHOLD * 1.2; // Max distance to swipe left

    // Keep translateX within the bounds for visual feedback
    const newTranslateX = Math.max(maxSwipeLeft, Math.min(maxSwipeRight, deltaX));
    setTranslateX(newTranslateX);

    e.preventDefault(); 
  }, [isDragging, SWIPE_THRESHOLD, getClientX]);

  const handleEnd = useCallback((e) => {
    if (!isDragging) return;
    
    setIsDragging(false);

    if (itemRef.current && e.pointerId !== undefined) {
      try {
        itemRef.current.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Fallback
      }
    }

    // Determine action based on final translateX value when released
    if (translateX < -SWIPE_THRESHOLD) { // Swipe left for delete, must pass full threshold
      confirmDelete(); 
    } else if (translateX > SWIPE_THRESHOLD) { // Swipe right for edit, must pass full threshold
      triggerEdit();
    }
    
    // Always snap back to 0 after release, regardless of whether an action was triggered
    setTranslateX(0); 
  }, [isDragging, translateX, SWIPE_THRESHOLD, confirmDelete, triggerEdit]);

  const handlePointerLeave = useCallback((e) => {
    if (isDragging) {
      setIsDragging(false);
      setTranslateX(0); // Snap back if pointer leaves while dragging
    }
  }, [isDragging]);

  const handleCardClick = useCallback((e) => {
    // If there was any swipe movement, prevent the click
    if (translateX !== 0) { 
      e.stopPropagation();
      e.preventDefault();
      closeSwipe(); // Ensure the card snaps back
      return;
    }
    
    if (onToggleComplete) {
      onToggleComplete(producto.firebaseId);
    }
  }, [translateX, closeSwipe, onToggleComplete, producto.firebaseId]);

  const handleEditButtonClick = useCallback((e) => {
    e.stopPropagation();
    closeSwipe();
    onEditar(producto);
  }, [closeSwipe, onEditar, producto]);

  const handleDeleteButtonClick = useCallback(async (e) => {
    e.stopPropagation();
    confirmDelete();
  }, [confirmDelete]);


  return (
    <div 
      className="product-item-wrapper" 
      ref={itemRef}
      onPointerDown={handleStart}
      onPointerMove={handleMove}
      onPointerUp={handleEnd}
      onPointerLeave={handlePointerLeave}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className={`product-item-card ${producto.completed ? 'completed' : ''} ${isDragging ? 'dragging' : ''} ${isMobile ? 'mobile' : 'desktop'}`}
        style={{ transform: `translateX(${translateX}px)` }}
        onClick={handleCardClick}
      >
        {/* Left content */}
        <div className="product-item-left-content">
          <div className="product-item-image">
            <span className="emoji-icon">{producto.icon || '❓'}</span>
          </div>
          <div className="product-item-details">
            {/* Usamos la nueva variable truncada aquí */}
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
              onClick={handleEditButtonClick}
              title="Editar producto"
              icon="✏️"
              variant="ghost"
              size="small"
            />
            <Button
              onClick={handleDeleteButtonClick}
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
          <div className="product-item-edit-overlay" style={{ width: `${SWIPE_THRESHOLD}px` }}>
            <Button
              title="Editar"
              variant="primary"
              className="swipe-edit-button"
            >
              Editar
            </Button>
          </div>
          <div className="product-item-delete-overlay" style={{ width: `${SWIPE_THRESHOLD}px` }}>
            <Button
              title="Eliminar"
              variant="danger"
              className="swipe-delete-button"
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