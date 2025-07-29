import React from 'react';
import './Header.css';

const Header = () => {
  return (
    <header className="header card fade-in">
      <div className="header-content">
        <span className="header-icon">🛒</span>
        <div className="header-text">
          <h1 className="header-title">Super Lista</h1>
        </div>
        <div className="header-subtitle">
          <p>Gestiona tu lista de compras en supermercados</p>
        </div>
      </div>
    </header>
  );
};

export default Header;