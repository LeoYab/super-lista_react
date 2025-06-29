import React from "react";
import "./TotalSummary.css";


const TotalSummary = ({ total }) => {
  return (
    <div className="total-summary">
      <h2>Total General:</h2>
      <h3>${total.toFixed(2)}</h3>
    </div>
  );
};

export default TotalSummary;