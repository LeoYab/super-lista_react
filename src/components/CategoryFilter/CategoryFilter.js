import React from 'react';
import './CategoryFilter.css';

// Rotating pastel palette for the category circles — purely presentational
// (derived from item position), no change to the categories data model.
// Exported so other category pickers (e.g. ProductForm's) can reuse the
// same circle-chip look for visual consistency.
export const CIRCLE_COLORS = ['tone-mint', 'tone-amber', 'tone-peach', 'tone-pink', 'tone-purple'];

const CategoryFilter = ({ categories, selectedCategoryId, onSelectCategory, groupByCategory, onToggleGroupBy }) => {
  return (
    <div className="category-scroll-container">
      <button
        type="button"
        className={`category-circle-item ${CIRCLE_COLORS[0]} ${groupByCategory ? 'active' : ''}`}
        onClick={onToggleGroupBy}
        title={groupByCategory ? 'Ver como lista simple' : 'Agrupar por categorías'}
      >
        <span className="category-icon-circle">
          {groupByCategory ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="9"></rect>
              <rect x="14" y="3" width="7" height="5"></rect>
              <rect x="14" y="12" width="7" height="9"></rect>
              <rect x="3" y="16" width="7" height="5"></rect>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
          )}
        </span>
        <span className="category-circle-label">{groupByCategory ? 'Agrupado' : 'Lista'}</span>
      </button>

      <button
        type="button"
        className={`category-circle-item ${CIRCLE_COLORS[0]} ${selectedCategoryId === '' ? 'active' : ''}`}
        onClick={() => onSelectCategory('')}
      >
        <span className="category-icon-circle">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
            <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
            <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
            <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
          </svg>
        </span>
        <span className="category-circle-label">Todas</span>
      </button>

      {categories.map((cat, index) => (
        <button
          type="button"
          key={cat.id}
          className={`category-circle-item ${CIRCLE_COLORS[(index + 1) % CIRCLE_COLORS.length]} ${selectedCategoryId === cat.id ? 'active' : ''}`}
          onClick={() => onSelectCategory(cat.id)}
        >
          <span className="category-icon-circle category-icon-emoji">{cat.icon}</span>
          <span className="category-circle-label">{cat.title}</span>
        </button>
      ))}
    </div>
  );
};

export default CategoryFilter;
