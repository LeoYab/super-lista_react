// src/App.test.js
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

test('renders the main app content or loading state', async () => {
  render(<App />);

  // Espera a que el texto de carga inicial desaparezca o a que el contenido principal aparezca.
  // Esto también ayudará a que las actualizaciones de estado de AuthProvider se resuelvan.
  await waitFor(() => {
    // Si la aplicación redirige al login, busca elementos de la página de AuthPage
    const loginButton = screen.getByRole('button', { name: /Iniciar Sesión|Registrarse/i });
    expect(loginButton).toBeInTheDocument();
  }, { timeout: 5000 }); // Aumenta el timeout si tu app tarda en cargar/redirigir

  // Si la app carga directamente la lista (si el usuario está logueado en el test):
  // await waitFor(() => {
  //   expect(screen.getByText(/Lista Actual:/i)).toBeInTheDocument();
  // }, { timeout: 5000 });
});