// src/components/ProductForm/ProductForm.js
import React, { useState, useEffect } from 'react';
import './ProductForm.css';
import Input from '../Input/Input';
import Select from '../Select/Select';
import Button from '../Buttons/Button';
// REMOVED: import Swal from 'sweetalert2'; // ¡Eliminamos esta importación!

// IMPORT NEW SERVICE: Importa tus funciones de notificación
import { showErrorAlert } from '../../Notifications/NotificationsServices';

// Nos aseguramos de que 'categories' siempre sea un array, incluso si es vacío.
const ProductForm = ({ editandoId, productoAEditar, onAgregar, onEditar, onCancelar, categories = [] }) => {

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
    cantidad: '',
    category: initialDefaultCategory.id, // Usamos la categoría inicial para el estado.
    icon: initialDefaultCategory.icon
  });
  const [error, setError] = useState('');

  // Efecto para inicializar o resetear el formulario.
  useEffect(() => {
    if (editandoId && productoAEditar) {
      const loadedCategory = typeof productoAEditar.category === 'string'
        ? parseInt(productoAEditar.category, 10)
        : productoAEditar.category;

      setProductData({
        nombre: productoAEditar.nombre,
        valor: productoAEditar.valor.toString(),
        cantidad: productoAEditar.cantidad.toString(),
        category: loadedCategory || initialDefaultCategory.id,
        icon: productoAEditar.icon || initialDefaultCategory.icon
      });
    } else {
      // Si no estamos editando, reiniciamos el formulario a sus valores por defecto
      // usando la categoría inicial que ya está garantizada como válida.
      setProductData({
        nombre: '',
        valor: '',
        cantidad: '',
        category: initialDefaultCategory.id,
        icon: initialDefaultCategory.icon
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

  const handleCategoryChange = (e) => {
    const selectedCategoryId = parseInt(e.target.value, 10);
    // Aseguramos que 'categories' es un array antes de usar 'find'
    const selectedCat = categories.find(cat => cat.id === selectedCategoryId);

    setProductData(prev => ({
      ...prev,
      category: selectedCategoryId,
      // Si la categoría seleccionada tiene íconos, usa el primero. Si no, usa el ícono de la categoría misma.
      // Si 'selectedCat' es undefined (lo cual no debería pasar con el 'required' en el Select), usa el fallback.
      icon: selectedCat ? (selectedCat.icons && selectedCat.icons[0] ? selectedCat.icons[0] : selectedCat.icon) : fallbackDefaultCategory.icon
    }));
  };

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
      cantidad: '',
      category: initialDefaultCategory.id,
      icon: initialDefaultCategory.icon
    });
  };

  // Prepara las opciones para el componente Select de Categoría
  // Garantizamos que 'categories' es un array antes de mapear.
  const categoryOptions = categories.map(cat => ({
    value: cat.id,
    label: `${cat.icon} ${cat.title}`
  }));

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

        <Input
          label="Cantidad:"
          id="cantidad"
          name="cantidad"
          type="number"
          value={productData.cantidad}
          onChange={handleChange}
          placeholder="Ej: 1, 2, 5"
          min="1"
          required
        />

        <Select
          label="Categoría:"
          id="category"
          name="category"
          value={productData.category}
          onChange={handleCategoryChange}
          options={[...categoryOptions]}
          required
        />

        <div className="form-actions">
          <Button type="submit" variant="primary">
            {editandoId ? 'Guardar Cambios' : 'Agregar Producto'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;