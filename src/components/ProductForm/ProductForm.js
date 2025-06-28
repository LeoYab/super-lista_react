// src/components/ProductForm/ProductForm.js
import React, { useState, useEffect } from 'react';
import './ProductForm.css';

const ProductForm = ({ editandoId, productoAEditar, onAgregar, onEditar, onCancelar, categories }) => {
  const otrosCategory = categories.find(cat => cat.title === 'Otros' || cat.id === 0);
  const defaultCategoryId = otrosCategory ? otrosCategory.id : 0;
  const defaultCategoryIcon = otrosCategory ? otrosCategory.icon : '🔤';

  const [productData, setProductData] = useState({
    nombre: '',
    valor: '',
    cantidad: '',
    category: defaultCategoryId,
    icon: defaultCategoryIcon
  });

  useEffect(() => {
    if (editandoId && productoAEditar) {
      const loadedCategory = typeof productoAEditar.category === 'string'
        ? parseInt(productoAEditar.category, 10)
        : productoAEditar.category;

      setProductData({
        nombre: productoAEditar.nombre,
        valor: productoAEditar.valor,
        cantidad: productoAEditar.cantidad,
        category: loadedCategory || defaultCategoryId,
        icon: productoAEditar.icon || defaultCategoryIcon
      });
    } else {
      setProductData({
        nombre: '',
        valor: '',
        cantidad: '',
        category: defaultCategoryId,
        icon: defaultCategoryIcon
      });
    }
  }, [editandoId, productoAEditar, categories, defaultCategoryId, defaultCategoryIcon]);

  const handleSubmit = (e) => {
    e.preventDefault();

    const parsedValor = parseFloat(productData.valor) || 0;
    const parsedCantidad = parseInt(productData.cantidad, 10) || 1;
    const selectedCategoryId = parseInt(productData.category, 10);
    const selectedCategory = categories.find(cat => cat.id === selectedCategoryId);

    if (editandoId) {
      onEditar(editandoId, {
        nombre: productData.nombre,
        valor: parsedValor,
        cantidad: parsedCantidad,
        category: selectedCategoryId,
        icon: selectedCategory ? selectedCategory.icon : defaultCategoryIcon
      });
    } else {
      onAgregar({
        nombre: productData.nombre,
        valor: parsedValor,
        cantidad: parsedCantidad,
        category: selectedCategoryId,
        icon: selectedCategory ? selectedCategory.icon : defaultCategoryIcon
      });
    }

    setProductData({
      nombre: '',
      valor: '',
      cantidad: '',
      category: defaultCategoryId,
      icon: defaultCategoryIcon
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProductData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCategoryChange = (e) => {
    const selectedCategoryId = parseInt(e.target.value, 10);
    const selectedCategory = categories.find(cat => cat.id === selectedCategoryId);
    setProductData(prev => ({
      ...prev,
      category: selectedCategoryId,
      icon: selectedCategory ? selectedCategory.icon : defaultCategoryIcon
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="product-form">
      <h2 className="form-title">{editandoId ? 'Editar Producto' : 'Añadir Nuevo Producto'}</h2>

      {/* UNA SOLA FILA que contendrá TODOS los grupos de campos */}
      <div className="form-row">
        {/* Nombre del Producto - Le damos más flex-grow para que ocupe más espacio */}
        <div className="form-group flex-grow-2">
          <label htmlFor="nombre">Nombre del Producto:</label>
          <input
            type="text"
            id="nombre"
            name="nombre"
            value={productData.nombre}
            onChange={handleChange}
            placeholder="Ej: Leche"
            required
          />
        </div>

        {/* Valor Unitario */}
        <div className="form-group">
          <label htmlFor="valor">Valor Unitario:</label>
          <input
            type="number"
            id="valor"
            name="valor"
            value={productData.valor}
            onChange={handleChange}
            placeholder="0.00"
            step="0.01"
            min="0"
          />
        </div>

        {/* Cantidad */}
        <div className="form-group">
          <label htmlFor="cantidad">Cantidad:</label>
          <input
            type="number"
            id="cantidad"
            name="cantidad"
            value={productData.cantidad}
            onChange={handleChange}
            placeholder="1"
            min="1"
            required
          />
        </div>

        {/* Categoría (select) - También le damos algo de flex-grow */}
        <div className="form-group flex-grow-1">
          <label htmlFor="category">Categoría:</label>
          <select
            id="category"
            name="category"
            value={productData.category}
            onChange={handleCategoryChange}
            required
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.icon} {cat.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-buttons">
        <button type="submit" className="submit-button">
          {editandoId ? 'Guardar Cambios' : 'Añadir Producto'}
        </button>
        {editandoId && (
          <button type="button" className="cancel-button" onClick={onCancelar}>
            Cancelar Edición
          </button>
        )}
      </div>
    </form>
  );
};

export default ProductForm;