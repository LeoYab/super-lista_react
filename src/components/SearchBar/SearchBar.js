// src/components/SearchBar/SearchBar.js
import React from 'react';
import './SearchBar.css';
import Input from '../Input/Input';

const SearchBar = ({ busqueda, setBusqueda }) => {


  return (
    <div className="search-bar">
      <div className="search-controls">
        <div className="search-input-container">
          <div className="search-icon">🔍</div>
          <Input
            id="search"
            name="search"
            type="text"
            placeholder="Buscar productos..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="search-input"
          />
        </div>
      </div>
    </div>
  );
};

export default SearchBar;