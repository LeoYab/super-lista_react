import React from 'react';
import './Header.css';

const Header = () => {
  return (
    <header className="header fade-in">
      <div className="header-content">
        <img src="/logo.svg" alt="Super Lista" className="header-icon" />
        <h1 className="header-title">Super Lista</h1>
      </div>
    </header>
  );
};

export default Header;
