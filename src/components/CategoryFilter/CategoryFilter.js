import React from 'react';
import { LayoutGrid, List, Grid2x2 } from 'lucide-react';
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
            <LayoutGrid size={20} strokeWidth={2.3} />
          ) : (
            <List size={20} strokeWidth={2.3} />
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
          <Grid2x2 size={20} strokeWidth={2.3} />
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
