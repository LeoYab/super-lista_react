// src/components/ProductList/ProductList.js
import React from 'react';
import ProductItem from '../ProductItem/ProductItem';
import './ProductList.css';

// Aseguramos que ProductList reciba todas las props necesarias
const ProductList = ({ productos, busqueda, onEditar, onEliminar, onToggleComplete, onClearProducts }) => {
  const productosToDisplay = productos || [];

  if (productosToDisplay.length === 0) {
    return (
      <div className="product-list card">
        <div className="empty-state">
          <div className="empty-icon">
            {busqueda ? '🔍' : '📦'}
          </div>
          <h3 className="empty-title">
            {busqueda ? 'No se encontraron productos' : 'No hay productos en tu lista'}
          </h3>
          <p className="empty-description">
            {busqueda
              ? `No hay productos que coincidan con "${busqueda}"`
              : 'Comienza agregando tu primer producto a la lista'
            }
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="product-list card">
      {productosToDisplay.map((producto) => (
        <ProductItem
          key={producto.firebaseId || producto.id} // Usar firebaseId como clave principal
          producto={producto}
          onEditar={onEditar}           // Pasa la función para iniciar la edición
          onEliminar={onEliminar}       // Pasa la función para eliminar
          onToggleComplete={onToggleComplete} // Pasa la función para marcar/desmarcar como completado
        />
      ))}
      {/* Botón para vaciar la lista, solo si hay productos */}
      {productosToDisplay.length > 0 && (
        <div className="list-summary">
          <p>Total de productos: <strong>{productosToDisplay.length}</strong></p>
          <button className="clear-button" onClick={onClearProducts}>Vaciar Lista</button>
        </div>
      )}
    </div>
  );
};

export default ProductList;