import React from 'react';
import './Header.css';

const Header = () => {
  return (
    <header className="header card fade-in">
      <div className="header-content">
        <div className="header-icon">
          🛒
        </div>
        <div className="header-text">
          <h1 className="header-title">Super Lista</h1>
          <p className="header-subtitle">Gestiona tu lista de compras de supermercado</p>
        </div>
      </div>
    </header>
  );
};

export default Header;