// src/components/SearchBar/SearchBar.js
import React from 'react';
import './SearchBar.css';
import Input from '../Input/Input'; // Keep Input import

const SearchBar = ({ busqueda, setBusqueda }) => {
  // REMOVED: mostrarFormulario, setMostrarFormulario, onCancelar, and manejarToggleFormulario
  // The button and its logic are now in App.js

  return (
    <div className="search-bar">
      <div className="search-controls">
        <div className="search-input-container">
          <div className="search-icon">🔍</div>
          <Input
            type="text"
            placeholder="Buscar productos..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="search-input"
          />
        </div>
        {/* REMOVED: The Button component was here */}
      </div>
    </div>
  );
};

export default SearchBar;