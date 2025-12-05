// src/components/SearchBar/SearchBar.js
import React from 'react';
import './SearchBar.css';
import Input from '../Input/Input';

const SearchBar = ({ busqueda, setBusqueda }) => {
  return (
    <div className="search-bar">
      <div className="search-controls">
        <div className="search-input-container">
          <div className="search-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchBar;