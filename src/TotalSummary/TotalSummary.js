// src/components/TotalSummary/TotalSummary.js
import React from "react";
import "./TotalSummary.css";

const TotalSummary = ({ total }) => {
  // Format the total with two decimal places and currency formatting
  const formattedTotal = total.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2, // Ensure at least 2 decimal places
    maximumFractionDigits: 2  // Ensure at most 2 decimal places
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