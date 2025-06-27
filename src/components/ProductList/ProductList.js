import React from 'react';
import ProductItem from '../ProductItem/ProductItem';
/* import './ProductList.css'; */

const ProductList = ({ productos, busqueda, onEditar, onEliminar }) => {
  if (productos.length === 0) {
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
      {productos.map((producto) => (
        <ProductItem
          key={producto.id}
          producto={producto}
          onEditar={onEditar}
          onEliminar={onEliminar}
        />
      ))}
    </div>
  );
};

export default ProductList;