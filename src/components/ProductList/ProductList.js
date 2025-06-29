// src/components/ProductList/ProductList.js
import React from 'react';
import ProductItem from '../ProductItem/ProductItem';
import './ProductList.css';

const ProductList = ({ productos, busqueda, onEditar, onEliminar /* <-- onClearProducts eliminado */ }) => {
  const filteredProducts = productos.filter(producto =>
    producto.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="product-list-container">
      {filteredProducts.length === 0 ? (
        <p className="no-products-message">
          No hay productos en esta lista o no coinciden con tu búsqueda.
        </p>
      ) : (
        <div className="table-wrapper">
          <table className="product-table">
            <thead>
              <tr className="product-table-header">
                <th className="header-producto">Producto</th>
                <th className="header-cantidad">Cantidad</th>
                <th className="header-precio">Precio</th>
                <th className="header-total">Total</th>
                <th className="header-acciones desktop-only-actions-header">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((producto) => (
                <ProductItem
                  key={producto.firebaseId}
                  producto={producto}
                  onEditar={onEditar}
                  onEliminar={onEliminar}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ProductList;