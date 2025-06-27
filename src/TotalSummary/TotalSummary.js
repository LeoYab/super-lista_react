import React from "react";
import "./TotalSummary.css";


const TotalSummary = ({ total }) => {
  return (
    <div className="total-summary">
      <h3>Total General</h3>
      <p>${total.toFixed(2)}</p>
    </div>
  );
};

export default TotalSummary;