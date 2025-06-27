import React from 'react';
import './SearchBar.css';

const SearchBar = ({ 
  busqueda, 
  setBusqueda, 
  mostrarFormulario, 
  setMostrarFormulario, 
  onCancelar 
}) => {
  const manejarToggleFormulario = () => {
    if (mostrarFormulario) {
      onCancelar();
    } else {
      setMostrarFormulario(true);
    }
  };

  return (
    <div className="search-bar">
      <div className="search-controls">
        <div className="search-input-container">
          <div className="search-icon">🔍</div>
          <input
            type="text"
            placeholder="Buscar productos..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="search-input"
          />
        </div>

        <button
          onClick={manejarToggleFormulario}
          className={`btn ${mostrarFormulario ? 'btn-secondary' : 'btn-primary'}`}
        >
          <span className="btn-icon">
            {mostrarFormulario ? '❌' : '➕'}
          </span>
          {mostrarFormulario ? 'Cancelar' : 'Agregar Producto'}
        </button>
      </div>
    </div>
  );
};

export default SearchBar;