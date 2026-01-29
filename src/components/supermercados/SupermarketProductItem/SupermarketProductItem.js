// src/components/supermercados/SupermarketProductItem/SupermarketProductItem.js
import React from 'react';
import Button from '../../Buttons/Button';
import './SupermarketProductItem.css';

const SupermarketProductItem = ({ product, onAddToList }) => {
  const hasOffer = product.precio_oferta && product.precio_oferta < product.precio;
  const displayPrice = hasOffer ? product.precio_oferta : product.precio;

  const formattedPrice = displayPrice.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const formattedOriginalPrice = product.precio.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const getStockStatusText = (stock) => {
    return stock ? 'En Stock' : 'Sin Stock';
  };

  const getStockStatusClass = (stock) => {
    return stock ? 'in-stock' : 'no-stock';
  };

  return (
    <div className={`supermarket-product-item-card ${hasOffer ? 'has-offer' : ''}`}>
      <div className="product-details-left">
        <div className="product-item-image-placeholder">
          🛒
        </div>
        <div className="product-info-text">
          <span className="product-name">{product.nombre}</span>
          {product.marca_producto && (
            <span className="product-brand">{product.marca_producto}</span>
          )}
          {hasOffer && product.promo1_leyenda && (
            <span className="product-promo-legend">
              📅 {product.promo1_leyenda}
            </span>
          )}
        </div>
      </div>
      <div className="product-details-right">
        <div className="price-container">
          {hasOffer && (
            <span className="original-price">{formattedOriginalPrice}</span>
          )}
          <span className="product-price">{formattedPrice}</span>
        </div>
        <span className={`product-stock ${getStockStatusClass(product.stock)}`}>
          {getStockStatusText(product.stock)}
        </span>
        <Button
          size="small"
          variant="primary"
          onClick={() => onAddToList({ ...product, valor: displayPrice })}
          disabled={!product.stock}>
          Agregar
        </Button>
      </div>
    </div>
  );
};

export default SupermarketProductItem;