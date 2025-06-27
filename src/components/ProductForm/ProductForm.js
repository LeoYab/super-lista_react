import React, { useState, useEffect } from 'react';
import './ProductForm.css';

const ProductForm = ({
  editandoId,
  productoAEditar,
  onAgregar,
  onEditar,
  onCancelar,
  categories // <--- AÑADIMOS LA PROP 'categories'
}) => {
  const [formulario, setFormulario] = useState({
    nombre: '',
    valor: '',
    cantidad: ''
  });

  const [selectedCategory, setSelectedCategory] = useState(''); // <--- NUEVO ESTADO PARA LA CATEGORÍA SELECCIONADA
  const [errores, setErrores] = useState({});

  useEffect(() => {
    if (productoAEditar) {
      setFormulario({
        nombre: productoAEditar.nombre,
        valor: productoAEditar.valor.toString(),
        cantidad: productoAEditar.cantidad.toString()
      });
      // <--- CONFIGURAR CATEGORÍA PARA EDICIÓN
      setSelectedCategory(productoAEditar.category ? productoAEditar.category.toString() : '');
    } else {
      setFormulario({ nombre: '', valor: '', cantidad: '' });
      // <--- RESETEAR CATEGORÍA CUANDO NO SE ESTÁ EDITANDO
      setSelectedCategory('');
    }
    setErrores({});
  }, [productoAEditar]);

  // <--- NUEVO useEffect para preseleccionar la primera categoría si hay
  useEffect(() => {
    if (categories && categories.length > 0 && !selectedCategory && !editandoId) {
      setSelectedCategory(categories[0].id.toString());
    }
  }, [categories, selectedCategory, editandoId]); // Dependencias actualizadas


  const validarFormulario = () => {
    const nuevosErrores = {};

    if (!formulario.nombre.trim()) {
      nuevosErrores.nombre = 'El nombre es obligatorio';
    }

    if (!formulario.valor || parseFloat(formulario.valor) <= 0) {
      nuevosErrores.valor = 'El valor debe ser mayor a 0';
    }

    if (!formulario.cantidad || parseInt(formulario.cantidad) <= 0) {
      nuevosErrores.cantidad = 'La cantidad debe ser mayor a 0';
    }

    if (!selectedCategory) { // <--- VALIDACIÓN DE CATEGORÍA
      nuevosErrores.categoria = 'Debes seleccionar una categoría';
    }

    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const manejarSubmit = (e) => {
    e.preventDefault();

    if (!validarFormulario()) {
      return;
    }

    // <--- ENCONTRAR ICONO Y CATEGORÍA A PARTIR DE selectedCategory
    const categoryObject = categories.find(cat => cat.id.toString() === selectedCategory);
    const categoryId = categoryObject ? parseInt(categoryObject.id) : 0; // Usar 0 (Otros) como fallback
    const icon = categoryObject ? categoryObject.icon : '🔤'; // Icono por defecto si no se encuentra


    const producto = {
      nombre: formulario.nombre.trim(),
      valor: parseFloat(formulario.valor),
      cantidad: parseInt(formulario.cantidad),
      category: categoryId, // <--- AÑADIMOS CATEGORÍA
      icon: icon           // <--- AÑADIMOS ICONO
    };

    if (editandoId) {
      onEditar(editandoId, producto);
    } else {
      onAgregar(producto);
    }

    setFormulario({ nombre: '', valor: '', cantidad: '' });
    setSelectedCategory(''); // <--- RESETEAR CATEGORÍA DESPUÉS DE SUBMIT
    setErrores({});
  };

  const manejarCambio = (campo, valor) => {
    setFormulario({ ...formulario, [campo]: valor });

    if (errores[campo]) {
      setErrores({ ...errores, [campo]: '' });
    }
  };

  // <--- NUEVA FUNCIÓN PARA MANEJAR CAMBIOS EN EL SELECT DE CATEGORÍAS
  const manejarCambioCategoria = (e) => {
    setSelectedCategory(e.target.value);
    if (errores.categoria) {
      setErrores({ ...errores, categoria: '' });
    }
  };

  const calcularTotal = () => {
    const valor = parseFloat(formulario.valor) || 0;
    const cantidad = parseInt(formulario.cantidad) || 0;
    return valor * cantidad;
  };

  return (
    <div className="product-form card slide-in">
      <div className="form-header">
        <h3 className="form-title">
          {editandoId ? '✏️ Editar Producto' : '➕ Agregar Nuevo Producto'}
        </h3>
      </div>

      <form onSubmit={manejarSubmit} className="form-content">
        <div className="form-row">
          <div className="input-group">
            <label htmlFor="nombre">Nombre del Producto</label>
            <input
              id="nombre"
              type="text"
              value={formulario.nombre}
              onChange={(e) => manejarCambio('nombre', e.target.value)}
              placeholder="Ej: Leche, Pan, Arroz..."
              className={errores.nombre ? 'input-error' : ''}
            />
            {errores.nombre && <span className="error-message">{errores.nombre}</span>}
          </div>

          <div className="input-group">
            <label htmlFor="valor">Valor Unitario ($)</label>
            <input
              id="valor"
              type="number"
              step="0.01"
              min="0"
              value={formulario.valor}
              onChange={(e) => manejarCambio('valor', e.target.value)}
              placeholder="0.00"
              className={errores.valor ? 'input-error' : ''}
            />
            {errores.valor && <span className="error-message">{errores.valor}</span>}
          </div>

          <div className="input-group">
            <label htmlFor="cantidad">Cantidad</label>
            <input
              id="cantidad"
              type="number"
              min="1"
              value={formulario.cantidad}
              onChange={(e) => manejarCambio('cantidad', e.target.value)}
              placeholder="1"
              className={errores.cantidad ? 'input-error' : ''}
            />
            {errores.cantidad && <span className="error-message">{errores.cantidad}</span>}
          </div>
        </div>

        {/* <--- NUEVO SELECTOR DE CATEGORÍA */}
        <div className="input-group">
          <label htmlFor="categoria">Categoría</label>
          <select
            id="categoria"
            value={selectedCategory}
            onChange={manejarCambioCategoria}
            className={errores.categoria ? 'input-error' : ''}
          >
            <option value="">Selecciona una categoría</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.icon} {cat.title}
              </option>
            ))}
          </select>
          {errores.categoria && <span className="error-message">{errores.categoria}</span>}
        </div>


        {(formulario.valor || formulario.cantidad) && (
          <div className="total-preview fade-in">
            <span className="total-label">Total estimado:</span>
            <span className="total-value">${calcularTotal().toFixed(2)}</span>
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            <span className="btn-icon">{editandoId ? '💾' : '➕'}</span>
            {editandoId ? 'Actualizar' : 'Agregar'}
          </button>
          <button type="button" onClick={onCancelar} className="btn btn-secondary">
            <span className="btn-icon">❌</span>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;