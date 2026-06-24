import React from 'react';
import './CategoryFilter.css';

const CategoryFilter = ({ categories, selectedCategoryId, onSelectCategory, groupByCategory, onToggleGroupBy }) => {
  return (
    <div className="category-scroll-container">
      <div
        className={`category-item toggle-group-tab ${groupByCategory ? 'active' : ''}`}
        onClick={onToggleGroupBy}
        title={groupByCategory ? "Ver como lista simple" : "Agrupar por categorías"}
      >
        <span className="category-name">
          {groupByCategory ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
              <rect x="3" y="3" width="7" height="9"></rect>
              <rect x="14" y="3" width="7" height="5"></rect>
              <rect x="14" y="12" width="7" height="9"></rect>
              <rect x="3" y="16" width="7" height="5"></rect>
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
          )}
          {groupByCategory ? 'Agrupado' : 'Lista'}
        </span>
      </div>
      <div
        className={`category-item ${selectedCategoryId === '' ? 'active' : ''}`}
        onClick={() => onSelectCategory('')}
      >
        <span className="category-name">🛒 Todas</span>
      </div>
      {categories.map((cat) => (
        <div
          key={cat.id}
          className={`category-item ${selectedCategoryId === cat.id ? 'active' : ''}`}
          onClick={() => onSelectCategory(cat.id)}
        >
          <span className="category-name">{cat.icon} {cat.title}</span>
        </div>
      ))}
    </div>
  );
};

export default CategoryFilter;

