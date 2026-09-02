// src/components/Skeleton/Skeleton.js
import React from 'react';
import './Skeleton.css';

export const Skeleton = ({ width = '100%', height = '1em', borderRadius, className = '', style = {} }) => (
  <span
    className={`skeleton ${className}`}
    style={{ width, height, borderRadius, ...style }}
  />
);

export const ProductCardSkeleton = () => (
  <div className="skeleton-product-card" aria-hidden="true">
    <Skeleton className="skeleton-avatar" />
    <div className="skeleton-lines">
      <Skeleton width="60%" height="0.95rem" />
      <Skeleton width="40%" height="0.8rem" />
    </div>
    <Skeleton className="skeleton-pill" />
  </div>
);

export const ProductListSkeleton = ({ rows = 4 }) => (
  <div className="product-cards-wrapper" role="status" aria-label="Cargando productos">
    {Array.from({ length: rows }).map((_, i) => (
      <ProductCardSkeleton key={i} />
    ))}
  </div>
);

export const BrandCardSkeleton = () => (
  <div className="skeleton-brand-card" aria-hidden="true">
    <Skeleton className="skeleton-avatar" />
    <Skeleton width="80%" height="0.75rem" />
  </div>
);

export const BrandGridSkeleton = ({ count = 6 }) => (
  <div className="supermarket-slider" role="status" aria-label="Cargando supermercados" style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
    {Array.from({ length: count }).map((_, i) => (
      <BrandCardSkeleton key={i} />
    ))}
  </div>
);
