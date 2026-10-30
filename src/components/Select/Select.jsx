// src/components/Select/Select.js
import React from 'react';
import './Select.css';

const Select = ({ label, id, value, onChange, options, className = '', ...props }) => {
  return (
    <div className={`select-group ${className}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="select-field"
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default Select;