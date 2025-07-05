// src/components/ProductList/ProductList.js
import React from 'react';
import ProductItem from '../ProductItem/ProductItem';
import './ProductList.css';

const ProductList = ({ productos, busqueda, onEditar, onEliminar, onToggleComplete }) => {

  const filteredProducts = productos.filter(producto =>
    producto.nombre && producto.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="product-list-container">
      {filteredProducts.length === 0 ? (
        <div className="no-products-message">
          {productos.length === 0 
            ? "No hay productos en esta lista. ¡Agrega tu primer producto!" 
            : `No se encontraron productos que coincidan con "${busqueda}"`
          }
        </div>
      ) : (
        <div className="product-cards-wrapper">
          {filteredProducts.map((producto) => (
            <ProductItem
              key={producto.firebaseId}
              producto={producto}
              onEditar={onEditar}
              onEliminar={onEliminar}
              onToggleComplete={onToggleComplete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductList;