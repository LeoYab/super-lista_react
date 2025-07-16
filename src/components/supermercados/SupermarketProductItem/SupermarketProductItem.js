// src/components/supermercados/SupermarketProductItem/SupermarketProductItem.js
import React from 'react';
import Button from '../../Buttons/Button';
import './SupermarketProductItem.css'; // Crearemos este CSS

const SupermarketProductItem = ({ product, onAddToList }) => {
    const formattedPrice = product.precio.toLocaleString('es-AR', {
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
        <div className="supermarket-product-item-card">
            <div className="product-details-left">
                {/* Asumimos que no hay íconos específicos de productos de supermercado por ahora,
                    podrías agregar un placeholder o lógica para íconos si los datos lo permiten */}
                <div className="product-item-image-placeholder">
                    🛒 {/* O un emoji genérico para productos */}
                </div>
                <div className="product-info-text">
                    <span className="product-name">{product.nombre}</span>
                    {product.marca_producto && (
                        <span className="product-brand">{product.marca_producto}</span>
                    )}
                </div>
            </div>
            <div className="product-details-right">
                <span className="product-price">{formattedPrice}</span>
                <span className={`product-stock ${getStockStatusClass(product.stock)}`}>
                    {getStockStatusText(product.stock)}
                </span>
                <Button
                    size="small"
                    variant="primary"
                    onClick={() => onAddToList(product)} // Lógica para agregar a la lista de usuario
                    disabled={!product.stock} // Deshabilitar si no hay stock
                >
                    Agregar
                </Button>
            </div>
        </div>
    );
};

export default SupermarketProductItem;