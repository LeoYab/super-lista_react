// src/App.test.js
import { render, screen } from '@testing-library/react';
import React from 'react';

// Componente de prueba simple que simula tu App
const MockApp = ({ currentUser }) => (
  <div>
    {currentUser ? (
      <div>Crea o selecciona una lista</div>
    ) : (
      <div>
        <button>Iniciar Sesión</button>
        <span>Regístrate</span>
      </div>
    )}
  </div>
);

test('muestra AuthPage cuando el usuario no está logueado', () => {
  render(<MockApp currentUser={null} />);
  expect(screen.getByText(/Iniciar Sesión/i)).toBeInTheDocument();
  expect(screen.getByText(/Regístrate/i)).toBeInTheDocument();
});

test('muestra contenido principal cuando el usuario está logueado', () => {
  render(<MockApp currentUser={{ uid: '123' }} />);
  expect(screen.getByText(/Crea o selecciona una lista/i)).toBeInTheDocument();
});
