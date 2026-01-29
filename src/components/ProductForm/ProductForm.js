// src/components/ProductForm/ProductForm.js
import React, { useState, useEffect } from 'react';

import './ProductForm.css';
import Input from '../Input/Input';
// Unused import removed

import Button from '../Buttons/Button';

// IMPORT NEW SERVICE: Importa tus funciones de notificación
import { showErrorAlert } from '../../Notifications/NotificationsServices';


const ProductForm = ({ editandoId, productoAEditar, onAgregar, onEditar, onCancelar, categories = [], onScan }) => {

  // Definimos una categoría de respaldo por si no hay categorías cargadas.
  const fallbackDefaultCategory = { id: 0, title: 'Sin Categoría', icon: '🔤', icons: ['🔤'] };

  // Buscamos la categoría 'Otros' o la primera categoría si existe.
  // Si 'categories' está vacío, 'find' devolverá undefined y categories[0] será undefined.
  // En ese caso, usamos 'fallbackDefaultCategory'.
  const otrosCategory = categories.find(cat => cat.title === 'Otros');
  const initialDefaultCategory = otrosCategory || categories[0] || fallbackDefaultCategory;

  const [productData, setProductData] = useState({
    nombre: '',
    valor: '',
    cantidad: '1',
    category: initialDefaultCategory.id, // Usamos la categoría inicial para el estado.
    icon: initialDefaultCategory.icon,
    precio_original: null,
    promo_leyenda: null
  });
  const [error, setError] = useState('');


  // Efecto para inicializar o resetear el formulario.
  useEffect(() => {
    if (productoAEditar) {
      const loadedCategory = typeof productoAEditar.category === 'string'
        ? parseInt(productoAEditar.category, 10)
        : productoAEditar.category;

      setProductData({
        nombre: productoAEditar.nombre,
        valor: productoAEditar.valor.toString(),
        cantidad: productoAEditar.cantidad.toString(),
        category: loadedCategory || initialDefaultCategory.id,
        icon: productoAEditar.icon || initialDefaultCategory.icon,
        precio_original: productoAEditar.precio_original || null,
        promo_leyenda: productoAEditar.promo_leyenda || null
      });
    } else {
      // Si no estamos editando, reiniciamos el formulario a sus valores por defecto
      // usando la categoría inicial que ya está garantizada como válida.
      setProductData({
        nombre: '',
        valor: '',
        cantidad: '1',
        category: initialDefaultCategory.id,
        icon: initialDefaultCategory.icon,
        precio_original: null,
        promo_leyenda: null
      });
      setError('');
    }
  }, [editandoId, productoAEditar, initialDefaultCategory]); // Dependencia actualizada a initialDefaultCategory


  const handleChange = (e) => {
    const { name, value } = e.target;
    setProductData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleIncrement = () => {
    setProductData(prev => ({
      ...prev,
      cantidad: (parseInt(prev.cantidad || 0, 10) + 1).toString()
    }));
  };

  const handleDecrement = () => {
    setProductData(prev => {
      const current = parseInt(prev.cantidad || 0, 10);
      if (current <= 1) return prev;
      return {
        ...prev,
        cantidad: (current - 1).toString()
      };
    });
  };

  // Unused handler removed


  const handleSubmit = (e) => {
    e.preventDefault();

    if (!productData.nombre.trim() || !productData.valor || !productData.cantidad || productData.category === undefined || !productData.icon) {
      setError('Todos los campos son obligatorios.');
      showErrorAlert('Error', 'Por favor, completa todos los campos.'); // Replaced Swal.fire
      return;
    }
    setError('');

    const parsedValor = parseFloat(productData.valor);
    const parsedCantidad = parseInt(productData.cantidad, 10);

    if (isNaN(parsedValor) || parsedValor < 0) {
      setError('El valor unitario debe ser un número positivo.');
      showErrorAlert('Error', 'El valor unitario debe ser un número positivo.'); // Replaced Swal.fire
      return;
    }
    if (isNaN(parsedCantidad) || parsedCantidad < 1) {
      setError('La cantidad debe ser un número entero positivo.');
      showErrorAlert('Error', 'La cantidad debe ser un número entero positivo.'); // Replaced Swal.fire
      return;
    }

    const dataToSubmit = {
      nombre: productData.nombre.trim(),
      valor: parsedValor,
      cantidad: parsedCantidad,
      category: productData.category,
      icon: productData.icon,
      precio_original: productData.precio_original,
      promo_leyenda: productData.promo_leyenda,
    };

    if (editandoId) {
      onEditar(editandoId, dataToSubmit);
    } else {
      onAgregar(dataToSubmit);
    }

    // Reinicia el formulario al estado inicial después de enviar
    setProductData({
      nombre: '',
      valor: '',
      cantidad: '1',
      category: initialDefaultCategory.id,
      icon: initialDefaultCategory.icon,
      precio_original: null,
      promo_leyenda: null
    });
  };

  // Prepara las opciones para el componente Select de Categoría
  // Garantizamos que 'categories' es un array antes de mapear.
  // Unused helper removed


  return (
    <div className="product-form-container card">
      <h3>{editandoId ? 'Editar Producto' : 'Agregar Nuevo Producto'}</h3>


      {error && <p className="form-error">{error}</p>}
      <form onSubmit={handleSubmit}>
        <Input
          label="Nombre del Producto:"
          id="nombre"
          name="nombre"
          value={productData.nombre}
          onChange={handleChange}
          placeholder="Ej: Leche, Pan, Arroz"
          maxLength={23}
          required
        />

        <Input
          label="Valor Unitario ($):"
          id="valor"
          name="valor"
          type="number"
          value={productData.valor}
          onChange={handleChange}
          placeholder="Ej: 1.50, 25.75"
          step="0.01"
          min="0"
          required
        />

        <div className="input-group">
          <label htmlFor="cantidad">Cantidad:</label>
          <div className="quantity-controls">
            <button type="button" onClick={handleDecrement} className="qty-btn">-</button>
            <input
              id="cantidad"
              name="cantidad"
              type="number"
              value={productData.cantidad}
              onChange={handleChange}
              placeholder="Ej: 1, 2, 5"
              min="1"
              required
              className="input-field qty-input"
            />
            <button type="button" onClick={handleIncrement} className="qty-btn">+</button>
          </div>
        </div>

        <div className="input-group category-section">
          <label>Categoría:</label>
          <div className="category-scroll-list">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`category-chip ${productData.category === cat.id ? 'active' : ''}`}
                onClick={() => {
                  const selectedCat = categories.find(c => c.id === cat.id);
                  setProductData(prev => ({
                    ...prev,
                    category: cat.id,
                    icon: selectedCat ? (selectedCat.icons && selectedCat.icons[0] ? selectedCat.icons[0] : selectedCat.icon) : fallbackDefaultCategory.icon
                  }));
                }}
              >
                <span className="category-icon">{cat.icon}</span>
                <span className="category-title">{cat.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onScan} className="btn-square" title="Escanear">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <path d="M8 7v10" />
              <path d="M12 7v10" />
              <path d="M16 7v10" />
              <line x1="4" y1="12" x2="20" y2="12" />
            </svg>
          </Button>

          <Button type="button" variant="secondary" onClick={onCancelar} className="btn-square" title="Cancelar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </Button>

          <Button type="submit" variant="primary" className="btn-square" title={editandoId ? 'Guardar' : 'Agregar'}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;