import React from 'react';
import './CategoryFilter.css';

const CategoryFilter = ({ categories, selectedCategoryId, onSelectCategory }) => {
  return (
    <div className="category-scroll-container">
      <div
        className={`category-item ${selectedCategoryId === '' ? 'active' : ''}`}
        onClick={() => onSelectCategory('')}
      >
        <span className="category-name">Todas</span>
      </div>
      {categories.map((cat) => (
        <div
          key={cat.id}
          className={`category-item ${selectedCategoryId === cat.id ? 'active' : ''}`}
          onClick={() => onSelectCategory(cat.id)}
        >
          <span className="category-name">{cat.title}</span>
        </div>
      ))}
    </div>
  );
};

export default CategoryFilter;
