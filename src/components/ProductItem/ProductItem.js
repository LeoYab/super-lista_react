import React, { useState, useRef } from 'react';
import './ProductItem.css';
import Swal from 'sweetalert2'; // Importa SweetAlert2 (asegúrate de haberlo instalado)

// Importa el componente Button
import Button from '../Buttons/Button';

const LONG_PRESS_THRESHOLD = 500; // Milisegundos para detectar una pulsación larga

// onToggleComplete se eliminó de las props, ya que la lógica fue actualizada.
const ProductItem = ({ producto, onEditar, onEliminar }) => {
  const itemTotal = (producto.valor || 0) * (producto.cantidad || 0);

  const timerRef = useRef(null);
  const [isLongPressDetected, setIsLongPressDetected] = useState(false);

  const handlePressStart = (e) => {
    e.stopPropagation(); // Evita que el evento se propague más allá de la celda

    // Limpia cualquier temporizador existente para evitar múltiples disparos
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setIsLongPressDetected(false); // Reinicia el estado de detección de pulsación larga

    timerRef.current = setTimeout(() => {
      setIsLongPressDetected(true); // Marca que se detectó una pulsación larga
      Swal.fire({
        title: '¿Estás seguro?',
        text: `¿Quieres eliminar "${producto.nombre}" de la lista?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33', // Rojo para confirmar
        cancelButtonColor: '#3085d6', // Azul para cancelar
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
      }).then((result) => {
        if (result.isConfirmed) {
          onEliminar(producto.firebaseId); // Llama a la función para eliminar el producto
          Swal.fire('¡Eliminado!', 'El producto ha sido eliminado.', 'success');
        }
      });
    }, LONG_PRESS_THRESHOLD);
  };

  const handlePressEnd = (e) => {
    e.stopPropagation(); // Evita que el evento se propague
    clearTimeout(timerRef.current); // Detiene el temporizador si se suelta antes del umbral
    timerRef.current = null; // Limpia la referencia del temporizador
  };

  const handleCellClick = (e) => {
    e.stopPropagation(); // Evita que el evento se propague

    // Si se detectó una pulsación larga, no dispares el 'onEditar'
    if (isLongPressDetected) {
      setIsLongPressDetected(false); // Resetea el estado
      return;
    }
    // Si no fue una pulsación larga, significa que fue un tap/clic normal
    onEditar(producto); // Llama a la función para editar el producto
  };

  // Props comunes para todas las celdas "clicables"
  const longPressAndClickProps = {
    onClick: handleCellClick,
    onMouseDown: handlePressStart,
    onMouseUp: handlePressEnd,
    onMouseLeave: handlePressEnd, // Importante para limpiar el temporizador si el mouse sale del elemento
    onTouchStart: handlePressStart,
    onTouchEnd: handlePressEnd,
  };

  return (
    <tr className={`product-item-row ${producto.completed ? 'completed' : ''}`}>
      {/* Celdas para Producto, Cantidad, Precio y Total: Tap para editar, Mantener para eliminar */}
      <td className="product-cell product-name-cell clickable-cell" {...longPressAndClickProps}>
        <span className="product-icon">{producto.icon}</span>
        <span className="product-name">{producto.nombre}</span>
      </td>

      <td className="product-cell product-quantity-cell clickable-cell" {...longPressAndClickProps}>
        {producto.cantidad}
      </td>

      <td className="product-cell product-price-cell clickable-cell" {...longPressAndClickProps}>
        ${(producto.valor || 0).toFixed(2)}
      </td>

      <td className="product-cell product-item-total-cell clickable-cell" {...longPressAndClickProps}>
        ${itemTotal.toFixed(2)}
      </td>

      {/* Celda para los Botones de Acción - Se mostrará en pantallas más grandes */}
      <td className="product-cell product-actions-cell desktop-only-actions">
        <div className="product-buttons">
          {/* Botón de Editar con el componente Button */}
          <Button
            className="round" // Clase para estilos específicos (ej. hacerlo redondo)
            onClick={(e) => {
              e.stopPropagation(); // Evita que el evento burbujee a la fila
              onEditar(producto); // Llama a la función de edición
            }}
            title="Editar producto"
            icon="✏️" // Icono visual
            variant="ghost" // Estilo visual (puede ser 'primary', 'secondary', etc.)
            size="small" // Tamaño del botón
          />
          {/* Botón de Eliminar con el componente Button */}
          <Button
            className="round" // Clase para estilos específicos
            onClick={(e) => {
              e.stopPropagation(); // Evita que el evento burbujee
              // Abre SweetAlert directamente en el clic para desktop
              Swal.fire({
                title: '¿Estás seguro?',
                text: `¿Quieres eliminar "${producto.nombre}" de la lista?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar'
              }).then((result) => {
                if (result.isConfirmed) {
                  onEliminar(producto.firebaseId);
                  Swal.fire('¡Eliminado!', 'El producto ha sido eliminado.', 'success');
                }
              });
            }}
            title="Eliminar producto"
            icon="🗑️" // Icono visual
            variant="danger" // Estilo visual (ej. rojo para peligro)
            size="small" // Tamaño del botón
          />
        </div>
      </td>
    </tr>
  );
};

export default ProductItem;