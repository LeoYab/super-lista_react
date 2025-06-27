import React from "react";
import "./ProductItem.css"; // Assuming you have a CSS file for styling

const ProductItem = ({ producto, onEditar, onEliminar }) => {
  return (
    <div className="product-item">
      <h4>{producto.nombre}</h4>
      <p>Precio: ${producto.valor}</p>
      <p>Cantidad: {producto.cantidad}</p>
      <p>Total: ${producto.total}</p>
      <button onClick={() => onEditar(producto)}>Editar</button>
      <button onClick={() => onEliminar(producto.id)}>Eliminar</button>
    </div>
  );
};

export default ProductItem;
