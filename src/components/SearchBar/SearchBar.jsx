// src/components/SearchBar/SearchBar.js
import React from 'react';
import { Search, X } from 'lucide-react';
import './SearchBar.css';
import Input from '../Input/Input';

const SearchBar = ({ busqueda, setBusqueda }) => {
  return (
    <div className="search-bar">
      <div className="search-controls">
        <div className="search-input-container">
          <div className="search-icon">
            <Search size={20} />
          </div>
          <Input
            id="search"
            name="search"
            type="text"
            placeholder="Buscar productos..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="search-input"
          />
          {busqueda && (
            <button
              className="clear-search-button"
              onClick={() => setBusqueda('')}
              aria-label="Borrar búsqueda"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchBar;