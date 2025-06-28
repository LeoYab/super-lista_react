// src/components/ProductList/ProductList.js
import React from 'react';
import ProductItem from '../ProductItem/ProductItem';
import './ProductList.css';

const ProductList = ({ productos, busqueda, onEditar, onEliminar /* <-- onClearProducts eliminado */ }) => {
  const filteredProducts = productos.filter(producto =>
    producto.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const totalGeneral = filteredProducts.reduce((sum, producto) => {
    if (!producto.completed) {
      const itemTotal = (producto.valor || 0) * (producto.cantidad || 0);
      return sum + itemTotal;
    }
    return sum;
  }, 0);

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
              <tr>
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

      {/* MODIFICACIÓN: El div 'list-actions' ahora solo contendrá el total general */}
      <div className="list-actions">
        {/* ELIMINADO: El botón "Vaciar Lista" */}
        <div className="total-general">
          <span>Total General:</span>
          <strong>${totalGeneral.toFixed(2)}</strong>
        </div>
      </div>
    </div>
  );
};

export default ProductList;