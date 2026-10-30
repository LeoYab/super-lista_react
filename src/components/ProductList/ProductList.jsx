// src/components/ProductList/ProductList.js
import React from 'react';
import ProductItem from '../ProductItem/ProductItem';
import './ProductList.css';

const ProductList = ({ productos, busqueda, onEditar, categories = [], groupByCategory = false }) => {

  const filteredProducts = productos.filter(producto =>
    producto.nombre && producto.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  if (filteredProducts.length === 0) {
    const isEmptyList = productos.length === 0;
    return (
      <div className="product-list-container">
        <div className="empty-state no-products-message">
          <span className="empty-icon">{isEmptyList ? '🛒' : '🔍'}</span>
          <p className="empty-title">
            {isEmptyList ? 'Tu lista está vacía' : 'Sin resultados'}
          </p>
          <p className="empty-description">
            {isEmptyList
              ? 'Agregá tu primer producto manualmente o escaneando su código de barras.'
              : `No encontramos productos que coincidan con "${busqueda}".`
            }
          </p>
        </div>
      </div>
    );
  }

  if (groupByCategory) {
    // Group products by category ID
    const groupedProducts = {};
    filteredProducts.forEach(producto => {
      const catId = producto.category !== undefined && producto.category !== null ? parseInt(producto.category, 10) : 0;
      if (!groupedProducts[catId]) {
        groupedProducts[catId] = [];
      }
      groupedProducts[catId].push(producto);
    });

    return (
      <div className="product-list-container grouped-view">
        {Object.entries(groupedProducts).map(([catIdStr, items]) => {
          const catId = parseInt(catIdStr, 10);
          const categoryObj = categories.find(c => c.id === catId);
          const categoryName = categoryObj ? categoryObj.title : 'Otros';
          const categoryIcon = categoryObj ? categoryObj.icon : '📦';

          return (
            <div key={catId} className="category-group">
              <h4 className="category-group-header">
                <span className="category-group-icon">{categoryIcon}</span>
                <span className="category-group-title">{categoryName}</span>
                <span className="category-group-badge">{items.length}</span>
              </h4>
              <div className="product-cards-wrapper">
                {items.map((producto) => (
                  <ProductItem
                    key={producto.firebaseId}
                    producto={producto}
                    onEditar={onEditar}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="product-list-container">
      <div className="product-cards-wrapper">
        {filteredProducts.map((producto) => (
          <ProductItem
            key={producto.firebaseId}
            producto={producto}
            onEditar={onEditar}
          />
        ))}
      </div>
    </div>
  );
};

export default ProductList;