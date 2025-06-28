// src/components/ProductItem/ProductItem.js
import React, { useState, useRef } from 'react';
import './ProductItem.css';
import Swal from 'sweetalert2'; // Importa SweetAlert2 (asegúrate de haberlo instalado)

const LONG_PRESS_THRESHOLD = 500; // Milisegundos para detectar una pulsación larga

// onToggleComplete se elimina de las props, ya que no se usará
const ProductItem = ({ producto, onEditar, onEliminar }) => {
  const itemTotal = (producto.valor || 0) * (producto.cantidad || 0);

  const timerRef = useRef(null);
  const [isLongPressDetected, setIsLongPressDetected] = useState(false);

  const handlePressStart = (e) => {
    e.stopPropagation();

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setIsLongPressDetected(false);

    timerRef.current = setTimeout(() => {
      setIsLongPressDetected(true);
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
    }, LONG_PRESS_THRESHOLD);
  };

  const handlePressEnd = (e) => {
    e.stopPropagation();
    clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const handleCellClick = (e) => {
    e.stopPropagation();

    if (isLongPressDetected) {
      setIsLongPressDetected(false);
      return;
    }
    onEditar(producto);
  };

  return (
    <tr className={`product-item-row ${producto.completed ? 'completed' : ''}`}>
      {/* ELIMINADA: La celda completa del Checkbox */}

      {/* Celdas para Producto, Cantidad, Precio y Total: Tap para editar, Mantener para eliminar */}
      <td
        className="product-cell product-name-cell clickable-cell"
        onClick={handleCellClick}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
      >
        <span className="product-icon">{producto.icon}</span>
        <span className="product-name">{producto.nombre}</span>
      </td>

      <td
        className="product-cell product-quantity-cell clickable-cell"
        onClick={handleCellClick}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
      >
        {producto.cantidad}
      </td>

      <td
        className="product-cell product-price-cell clickable-cell"
        onClick={handleCellClick}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
      >
        ${(producto.valor || 0).toFixed(2)}
      </td>

      <td
        className="product-cell product-item-total-cell clickable-cell"
        onClick={handleCellClick}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
      >
        ${itemTotal.toFixed(2)}
      </td>

      {/* Celda para los Botones de Acción - Se ocultará en móvil con CSS */}
      <td className="product-cell product-actions-cell desktop-only-actions">
        <div className="product-buttons">
          <button
            className="edit-button"
            onClick={(e) => {
              e.stopPropagation();
              onEditar(producto);
            }}
            title="Editar producto"
          >
            ✏️
          </button>
          <button
            className="delete-button"
            onClick={(e) => {
              e.stopPropagation();
              onEliminar(producto.firebaseId);
            }}
            title="Eliminar producto"
          >
            🗑️
          </button>
        </div>
      </td>
    </tr>
  );
};

export default ProductItem;