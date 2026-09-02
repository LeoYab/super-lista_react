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
  title = '',
  ...rest
}) => {
  const classNames = `btn btn-${variant} btn-${size} ${className}`;
  // Icon-only buttons (no visible text children) need an accessible name for
  // screen readers — fall back to the title text via aria-label unless the
  // caller already provided one explicitly.
  const accessibleLabelProps = (!children && title && !rest['aria-label'])
    ? { 'aria-label': title }
    : {};

  return (
    <button
      className={classNames}
      onClick={onClick}
      disabled={disabled}
      type={type}
      title={title}
      {...accessibleLabelProps}
      {...rest}
    >
      {icon && <span className="btn-icon">{icon}</span>}
      {children}
    </button>
  );
};

export default Button;