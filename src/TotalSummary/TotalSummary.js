// src/components/TotalSummary/TotalSummary.js
import React from "react";
import "./TotalSummary.css";

const TotalSummary = ({ total }) => {
  // Format the total with two decimal places and currency formatting
const hasDecimals = total % 1 !== 0;

const formattedTotal = total.toLocaleString('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: hasDecimals ? 2 : 0,
  maximumFractionDigits: hasDecimals ? 2 : 0
});

  return (
    <div className="total-summary">
      <h2>Total General:</h2>
      {/* Display the formatted total */}
      <h3>{formattedTotal}</h3>
    </div>
  );
};

export default TotalSummary;