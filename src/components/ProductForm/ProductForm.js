import React, { useState, useEffect } from 'react';
import './ProductForm.css';

const ProductForm = ({ 
  editandoId, 
  productoAEditar, 
  onAgregar, 
  onEditar, 
  onCancelar 
}) => {
  const [formulario, setFormulario] = useState({
    nombre: '',
    valor: '',
    cantidad: ''
  });

  const [errores, setErrores] = useState({});

  useEffect(() => {
    if (productoAEditar) {
      setFormulario({
        nombre: productoAEditar.nombre,
        valor: productoAEditar.valor.toString(),
        cantidad: productoAEditar.cantidad.toString()
      });
    } else {
      setFormulario({ nombre: '', valor: '', cantidad: '' });
    }
    setErrores({});
  }, [productoAEditar]);

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

    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0;
  };

  const manejarSubmit = (e) => {
    e.preventDefault();
    
    if (!validarFormulario()) {
      return;
    }

    const producto = {
      nombre: formulario.nombre.trim(),
      valor: parseFloat(formulario.valor),
      cantidad: parseInt(formulario.cantidad)
    };

    if (editandoId) {
      onEditar(editandoId, producto);
    } else {
      onAgregar(producto);
    }

    setFormulario({ nombre: '', valor: '', cantidad: '' });
    setErrores({});
  };

  const manejarCambio = (campo, valor) => {
    setFormulario({ ...formulario, [campo]: valor });
    
    // Limpiar error del campo cuando el usuario empiece a escribir
    if (errores[campo]) {
      setErrores({ ...errores, [campo]: '' });
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