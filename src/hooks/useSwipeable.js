// src/components/hooks/useSwipeable.js
import { useState, useRef, useCallback } from 'react';

/**
 * Un hook personalizado para manejar la lógica de "deslizar para acción" en un elemento,
 * replicando el comportamiento de tu implementación original.
 * @param {object} config - Configuración para el hook.
 * @param {number} [config.swipeThreshold=90] - La cantidad de píxeles que se debe deslizar para que la acción se "enganche".
 * @param {function} [config.onSwipeLeftAction] - Callback que se ejecuta cuando se desliza a la izquierda más allá del umbral y se suelta.
 * @param {function} [config.onSwipeRightAction] - Callback que se ejecuta cuando se desliza a la derecha más allá del umbral y se suelta.
 * @param {function} [config.onCardClick] - Callback que se ejecuta cuando se hace clic en la tarjeta sin deslizar.
 * @returns {object} - Propiedades y manejadores para aplicar al componente.
 */
export const useSwipeable = ({
    swipeThreshold = 90,
    onSwipeLeftAction,
    onSwipeRightAction,
    onCardClick, // Nuevo: para manejar el click sin swipe
}) => {
    const itemRef = useRef(null);
    const [translateX, setTranslateX] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const startX = useRef(0);
    const currentX = useRef(0); // Mantenemos esta ref para replicar tu lógica original

    // Replicamos tu función closeSwipe que simplemente pone translateX a 0
    const closeSwipe = useCallback(() => {
        setTranslateX(0);
    }, []);

    // Replicamos tu getClientX
    const getClientX = useCallback((e) => {
        if (e.touches && e.touches.length > 0) {
            return e.touches[0].clientX;
        }
        return e.clientX;
    }, []);

    // Replicamos tu handleStart (onPointerDown)
    const handlePointerDown = useCallback((e) => {
        // Tu lógica original para ignorar clicks en botones de acción ya está aquí:
        // '.product-item-actions' (desktop), '.swipe-action-button' (mobile, aunque lo renombraste)
        // O clic derecho
        if (e.target.closest('.product-item-actions') || e.target.closest('.swipe-edit-button') || e.target.closest('.swipe-delete-button') || e.button === 2) {
            // No iniciamos el arrastre si es un botón de acción o clic derecho
            return;
        }
        
        setIsDragging(true);
        startX.current = getClientX(e);
        currentX.current = startX.current; // Inicializa currentX

        // Captura de puntero, replicando tu try-catch
        if (itemRef.current && e.pointerId !== undefined) {
            try {
                itemRef.current.setPointerCapture(e.pointerId);
            } catch (err) {
                console.warn("Swipe: Failed to set pointer capture", err);
            }
        }
        
        e.preventDefault(); 
    }, [getClientX]); // Dependencias: getClientX

    // Replicamos tu handleMove (onPointerMove)
    const handlePointerMove = useCallback((e) => {
        if (!isDragging) return;

        currentX.current = getClientX(e);
        const deltaX = currentX.current - startX.current;
        
        // Replicamos tus límites de deslizamiento originales (SWIPE_THRESHOLD * 1.2)
        const maxSwipeRight = swipeThreshold * 1.2;
        const maxSwipeLeft = -swipeThreshold * 1.2;

        const newTranslateX = Math.max(maxSwipeLeft, Math.min(maxSwipeRight, deltaX));
        setTranslateX(newTranslateX);

        e.preventDefault(); 
    }, [isDragging, swipeThreshold, getClientX]);

    // Replicamos tu handleEnd (onPointerUp)
    const handlePointerUp = useCallback((e) => {
        if (!isDragging) return;
        
        setIsDragging(false);

        // Libera la captura de puntero, replicando tu try-catch
        if (itemRef.current && e.pointerId !== undefined) {
            try {
                itemRef.current.releasePointerCapture(e.pointerId);
            } catch (err) {
                console.warn("Swipe: Failed to release pointer capture", err);
            }
        }

        // --- LÓGICA DE ACCIÓN: Disparar y Volver a 0 ---
        if (translateX < -swipeThreshold) { // Swipe left
            if (onSwipeLeftAction) onSwipeLeftAction(); 
        } else if (translateX > swipeThreshold) { // Swipe right
            if (onSwipeRightAction) onSwipeRightAction();
        }
        
        // Siempre vuelve a 0 después de soltar, independientemente de la acción
        closeSwipe(); 
    }, [isDragging, translateX, swipeThreshold, onSwipeLeftAction, onSwipeRightAction, closeSwipe]);

    // Replicamos tu handlePointerLeave
    const handlePointerLeave = useCallback((e) => {
        if (isDragging) {
            setIsDragging(false);
            closeSwipe(); // Vuelve a 0 si el puntero sale mientras arrastra
            // Libera captura de puntero si es necesario
            if (itemRef.current && e.pointerId !== undefined) {
                try {
                    itemRef.current.releasePointerCapture(e.pointerId);
                } catch (err) {
                    console.warn("Swipe: Failed to release pointer capture on leave", err);
                }
            }
        }
    }, [isDragging, closeSwipe]);

    // Replicamos tu handleCardClick logic
    const handleCardClick = useCallback((e) => {
        // Tu lógica original: si hubo algún movimiento de swipe (translateX no es 0),
        // previene el click y cierra el swipe.
        if (translateX !== 0) { 
            e.stopPropagation();
            e.preventDefault();
            closeSwipe(); 
            return;
        }
        // Si no hubo swipe, ejecuta el callback onCardClick (tu onToggleComplete)
        if (onCardClick) {
            onCardClick();
        }
    }, [translateX, closeSwipe, onCardClick]);

    // Propiedades para pasar al contenedor del elemento deslizable
    const wrapperProps = {
        ref: itemRef,
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerLeave: handlePointerLeave,
        onContextMenu: (e) => e.preventDefault(),
        // Para asegurar compatibilidad táctil si los Pointer Events no son suficientes:
        onTouchStart: handlePointerDown,
        onTouchMove: handlePointerMove,
        onTouchEnd: handlePointerUp,
        onClick: handleCardClick, // La tarjeta principal ahora tiene el onClick del hook
    };

    return { wrapperProps, translateX, isDragging }; // isRevealed ya no es tan relevante con este modelo
};