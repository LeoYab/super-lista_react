// src/components/Input/Input.js
import React from 'react';
import './Input.css';

const Input = ({ label, id, name, type = 'text', value, onChange, placeholder, className = '', ...props }) => {
  return (
    <div className={`input-group ${className}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="input-field"
        {...props}
      />
    </div>
  );
};

export default Input;