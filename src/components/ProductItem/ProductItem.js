// src/components/ProductItem/ProductItem.js
import React from 'react';
import './ProductItem.css';

// Aseguramos que ProductItem recibe las props esperadas
const ProductItem = ({ producto, onToggleComplete, onEditar, onEliminar }) => {
  return (
    <div className={`product-item ${producto.completed ? 'completed' : ''}`}>
      <div className="product-info">
        <span
          className="product-name-display"
          // Al hacer clic en el nombre, se llama a onToggleComplete
          onClick={() => onToggleComplete(producto.firebaseId)}
        >
          {producto.icon} {producto.nombre}
        </span>
        <span className="product-quantity">x{producto.cantidad}</span>
        <span className="product-price">${producto.valor.toFixed(2)}</span>
      </div>
      <div className="product-actions">
        {/* Botón de editar */}
        <button
          className="action-button edit-button"
          // Al hacer clic en el botón de editar, se llama a onEditar
          // Pasamos el producto completo para que el formulario lo cargue
          onClick={() => onEditar(producto)}
        >
          ✏️
        </button>
        {/* Botón de eliminar */}
        <button
          className="action-button delete-button"
          // Al hacer clic en el botón de eliminar, se llama a onEliminar
          onClick={() => onEliminar(producto.firebaseId)}
        >
          🗑️
        </button>
      </div>
    </div>
  );
};

export default ProductItem;