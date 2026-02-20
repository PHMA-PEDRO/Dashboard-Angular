import React from 'react';
import './LoadingSpinner.css';

export default function LoadingSpinner({ label = 'Carregando...' }) {
  return (
    <div className="loading-spinner-wrap">
      <div className="loading-spinner" />
      <span className="loading-spinner-label">{label}</span>
    </div>
  );
}
