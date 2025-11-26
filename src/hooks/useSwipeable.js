// src/components/hooks/useSwipeable.js
import { useState, useRef, useCallback } from 'react';

/**
 * Un hook personalizado para manejar la lógica de "deslizar para acción" en un elemento.
 * Mejorado para distinguir entre scroll vertical y swipe horizontal.
 */
export const useSwipeable = ({
  swipeThreshold = 90,
  onSwipeLeftAction,
  onSwipeRightAction,
  onCardClick,
}) => {
  const itemRef = useRef(null);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Refs para el seguimiento del gesto
  const startX = useRef(0);
  const startY = useRef(0);
  const isHorizontalSwipe = useRef(null); // null: indeterminado, true: swipe, false: scroll

  const closeSwipe = useCallback(() => {
    setTranslateX(0);
  }, []);

  const getClientX = (e) => {
    return e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
  };

  const getClientY = (e) => {
    return e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
  };

  const handlePointerDown = useCallback((e) => {
    // Ignorar si es clic en botones de acción o clic derecho
    if (e.target.closest('.product-item-actions') ||
      e.target.closest('.swipe-edit-button') ||
      e.target.closest('.swipe-delete-button') ||
      e.button === 2) {
      return;
    }

    // NO llamamos a e.preventDefault() aquí para permitir que el navegador detecte el scroll

    startX.current = getClientX(e);
    startY.current = getClientY(e);
    isHorizontalSwipe.current = null; // Resetear detección
    setIsDragging(false);

    if (itemRef.current && e.pointerId !== undefined) {
      try {
        itemRef.current.setPointerCapture(e.pointerId);
      } catch (err) {
        // Ignorar errores de captura
      }
    }
  }, []);

  const handlePointerMove = useCallback((e) => {
    // Si ya determinamos que es scroll vertical, no hacemos nada
    if (isHorizontalSwipe.current === false) return;

    const currentX = getClientX(e);
    const currentY = getClientY(e);
    const deltaX = currentX - startX.current;
    const deltaY = currentY - startY.current;

    // Si aún no hemos determinado la dirección
    if (isHorizontalSwipe.current === null) {
      // Umbral mínimo de movimiento para decidir (ej. 10px)
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          // Es un swipe horizontal
          isHorizontalSwipe.current = true;
          setIsDragging(true);
        } else {
          // Es un scroll vertical
          isHorizontalSwipe.current = false;
          return; // Dejar que el navegador haga scroll
        }
      } else {
        // Aún no se ha movido lo suficiente
        return;
      }
    }

    // Si es un swipe horizontal confirmado
    if (isHorizontalSwipe.current) {
      e.preventDefault(); // Prevenir scroll vertical ahora que estamos haciendo swipe

      // Aumentamos el límite visual para que se vea todo el texto
      // Permitimos arrastrar hasta 2 veces el umbral o un fijo generoso
      const maxDrag = Math.max(swipeThreshold * 2.5, 200);

      // Aplicamos resistencia logarítmica o lineal simple
      let newTranslateX = deltaX;

      // Limitar el arrastre visual
      if (newTranslateX > maxDrag) newTranslateX = maxDrag;
      if (newTranslateX < -maxDrag) newTranslateX = -maxDrag;

      setTranslateX(newTranslateX);
    }
  }, [swipeThreshold]);

  const handlePointerUp = useCallback((e) => {
    if (isHorizontalSwipe.current === false) {
      // Fue un scroll, limpiar y salir
      isHorizontalSwipe.current = null;
      return;
    }

    if (isDragging) {
      // Lógica de acción
      if (translateX < -swipeThreshold) {
        if (onSwipeLeftAction) onSwipeLeftAction();
      } else if (translateX > swipeThreshold) {
        if (onSwipeRightAction) onSwipeRightAction();
      }
    }

    // Limpieza final
    setIsDragging(false);
    isHorizontalSwipe.current = null;
    closeSwipe();

    if (itemRef.current && e.pointerId !== undefined) {
      try {
        itemRef.current.releasePointerCapture(e.pointerId);
      } catch (err) { }
    }
  }, [isDragging, translateX, swipeThreshold, onSwipeLeftAction, onSwipeRightAction, closeSwipe]);

  const handlePointerLeave = useCallback((e) => {
    if (isDragging) {
      setIsDragging(false);
      closeSwipe();
      if (itemRef.current && e.pointerId !== undefined) {
        try {
          itemRef.current.releasePointerCapture(e.pointerId);
        } catch (err) { }
      }
    }
  }, [isDragging, closeSwipe]);

  const handleCardClick = useCallback((e) => {
    // Si se estaba arrastrando, prevenimos el click
    if (isDragging || Math.abs(translateX) > 5) {
      e.stopPropagation();
      e.preventDefault();
      closeSwipe();
      return;
    }

    if (onCardClick) {
      onCardClick();
    }
  }, [isDragging, translateX, closeSwipe, onCardClick]);

  const wrapperProps = {
    ref: itemRef,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerLeave: handlePointerLeave,
    onContextMenu: (e) => e.preventDefault(),
    // Eventos táctiles para respaldo
    onTouchStart: handlePointerDown,
    onTouchMove: handlePointerMove,
    onTouchEnd: handlePointerUp,
    onClick: handleCardClick,
    style: { touchAction: 'pan-y' } // Importante: permite al navegador manejar el scroll vertical
  };

  return { wrapperProps, translateX, isDragging };
};