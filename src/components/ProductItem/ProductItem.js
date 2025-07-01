// src/components/ProductItem/ProductItem.js
import React, { useState, useRef, useCallback, useEffect } from 'react';
import './ProductItem.css';
import Button from '../Buttons/Button';
import { showConfirmAlert, showSuccessToast } from '../../Notifications/NotificationsServices';

const ProductItem = ({ producto, onEditar, onEliminar, onToggleComplete }) => {
  const itemTotal = (producto.valor || 0) * (producto.cantidad || 0);

  const formattedPrice = (producto.valor || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  const formattedTotal = itemTotal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

  const itemRef = useRef(null);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);
  const [isMobile, setIsMobile] = useState(false); // Nuevo estado para detectar móvil

  const SWIPE_THRESHOLD = 90; // Umbral para activar la acción de swipe

  // Detectar si es un dispositivo móvil (basado en el ancho de la ventana)
  useEffect(() => {
    const checkIsMobile = () => {
      // Usamos un breakpoint similar al de las media queries en CSS
      setIsMobile(window.innerWidth <= 768); 
    };

    checkIsMobile(); // Comprobar al montar el componente
    window.addEventListener('resize', checkIsMobile); // Recomprobar al redimensionar

    return () => {
      window.removeEventListener('resize', checkIsMobile); // Limpieza al desmontar
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
        closeSwipe();
      }
    } catch (error) {
      console.error('Error al confirmar eliminación:', error);
      closeSwipe();
    }
  }, [producto.firebaseId, producto.nombre, onEliminar, closeSwipe]);

  const triggerEdit = useCallback(() => {
    closeSwipe(); // Cierra el swipe antes de editar
    onEditar(producto);
  }, [closeSwipe, onEditar, producto]);

  // Función unificada para obtener la coordenada X del evento
  const getClientX = useCallback((e) => {
    if (e.touches && e.touches.length > 0) {
      return e.touches[0].clientX;
    }
    return e.clientX;
  }, []);

  const handleStart = useCallback((e) => {
    // Si no es móvil o si se hizo clic en un botón, no iniciar swipe
    if (!isMobile || e.target.closest('.product-item-actions')) {
      return;
    }
    
    // Prevenir clic derecho
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
    
    // Prevenir el comportamiento por defecto (scroll vertical, selección de texto)
    e.preventDefault(); 
  }, [isMobile, getClientX]);

  const handleMove = useCallback((e) => {
    if (!isDragging) return;

    currentX.current = getClientX(e);
    const deltaX = currentX.current - startX.current;
    
    // Limitar el swipe para ambos lados
    // Si deltaX es positivo (swipe a la derecha), limitarlo al umbral
    // Si deltaX es negativo (swipe a la izquierda), limitarlo al -umbral
    const maxSwipeRight = SWIPE_THRESHOLD;
    const maxSwipeLeft = -SWIPE_THRESHOLD;

    const newTranslateX = Math.max(maxSwipeLeft * 1.2, Math.min(maxSwipeRight * 1.2, deltaX)); // Permitir un poco de "rebote"
    setTranslateX(newTranslateX);

    // Prevenir el scroll durante el arrastre horizontal
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

    // Determinar la acción basada en la dirección y el umbral
    if (translateX < -SWIPE_THRESHOLD / 2) { // Swipe a la izquierda (eliminar)
      confirmDelete(); 
    } else if (translateX > SWIPE_THRESHOLD / 2) { // Swipe a la derecha (editar)
      triggerEdit();
    }
    
    setTranslateX(0); // Siempre volver a la posición original después de soltar
  }, [isDragging, translateX, SWIPE_THRESHOLD, confirmDelete, triggerEdit]);

  const handlePointerLeave = useCallback((e) => {
    if (isDragging) {
      // Si el puntero se sale del elemento mientras se arrastra, resetear
      setIsDragging(false);
      setTranslateX(0);
    }
  }, [isDragging]);

  const handleCardClick = useCallback((e) => {
    // Si hubo algún movimiento de swipe, prevenir el click
    if (translateX !== 0) { 
      e.stopPropagation();
      e.preventDefault();
      closeSwipe(); // Asegurarse de que la tarjeta regrese a su lugar
      return;
    }
    
    // Si no hubo swipe, proceder con el toggle de completado
    if (onToggleComplete) {
      onToggleComplete(producto.firebaseId);
    }
  }, [translateX, closeSwipe, onToggleComplete, producto.firebaseId]);

  const handleEditButtonClick = useCallback((e) => {
    e.stopPropagation(); // Prevenir que el clic del botón se propague a la tarjeta
    closeSwipe(); // Asegurarse de que el swipe se cierre si está abierto
    onEditar(producto);
  }, [closeSwipe, onEditar, producto]);

  const handleDeleteButtonClick = useCallback(async (e) => {
    e.stopPropagation(); // Prevenir que el clic del botón se propague a la tarjeta
    // No necesitamos closeSwipe() aquí porque no estamos en modo swipe.
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
        {/* Contenido principal de la tarjeta */}
        <div className="product-item-left-content">
          <div className="product-item-image">
            <span className="emoji-icon">{producto.icon || '❓'}</span>
          </div>
          <div className="product-item-details">
            <span className="product-item-name">{producto.nombre}</span>
            <span className="product-item-unit-detail">Precio Unitario: {formattedPrice}</span>
          </div>
        </div>

        {/* Contenido principal de la tarjeta - derecha */}
        <div className="product-item-right-content">
          <span className="product-item-quantity-text">Cantidad: {producto.cantidad}</span>
          <span className="product-item-total-price">Total: {formattedTotal}</span>
        </div>

        {/* Botones de acción VISIBLES SOLO EN ESCRITORIO */}
        {/* En móvil, estos se ocultarán por CSS y la funcionalidad será swipe */}
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

      {/* Overlay para "Editar" (aparece con swipe a la derecha en móvil) */}
      {isMobile && (
        <div className="product-item-edit-overlay" style={{ width: `${SWIPE_THRESHOLD}px` }}>
          <Button
            title="Editar"
            variant="primary" // o un color azul que tengas en tus variables
            className="swipe-edit-button"
            // No necesita onClick aquí, se activa al soltar el swipe
          >
            Editar
          </Button>
        </div>
      )}

      {/* Overlay para "Eliminar" (aparece con swipe a la izquierda en móvil) */}
      {isMobile && (
        <div className="product-item-delete-overlay" style={{ width: `${SWIPE_THRESHOLD}px` }}>
          <Button
            title="Eliminar"
            variant="danger"
            className="swipe-delete-button"
            // No necesita onClick aquí, se activa al soltar el swipe
          >
            Eliminar
          </Button>
        </div>
      )}
    </div>
  );
};

export default ProductItem;