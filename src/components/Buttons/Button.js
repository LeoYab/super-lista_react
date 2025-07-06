// src/components/Button/Button.js
import React from 'react';
import './Button.css';

const Button = ({
  children,
  onClick,
  variant = 'primary', 
  size = 'medium', 
  icon, // '➕', '🗑️', '✏️', etc.
  disabled = false,
  type = 'button',
  className = '',
  title = ''
}) => {
  const classNames = `btn btn-${variant} btn-${size} ${className}`;

  return (
    <button
      className={classNames}
      onClick={onClick}
      disabled={disabled}
      type={type}
      title={title}
    >
      {icon && <span className="btn-icon">{icon}</span>}
      {children}
    </button>
  );
};

export default Button;