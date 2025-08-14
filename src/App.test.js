import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { AuthContext } from './context/AuthContext';

// Mocking the context providers
const mockAuthContext = {
  currentUser: null,
  logout: jest.fn(),
};

test('renders AuthPage when user is not logged in', async () => {
  render(
    <AuthContext.Provider value={mockAuthContext}>
      <App />
    </AuthContext.Provider>
  );

  // Since the App component now handles routing, we need to wait for the navigation to the /auth page
  await waitFor(() => {
    // The AuthPage should be rendered, which contains the login/register buttons
    expect(screen.getByRole('button', { name: /Iniciar Sesión/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Registrarse/i })).toBeInTheDocument();
  });
});

test('renders main app content when user is logged in', async () => {
    const mockUser = {
        uid: 'test-uid',
        email: 'test@example.com',
    };

    const loggedInAuthContext = {
        currentUser: mockUser,
        logout: jest.fn(),
    };

    render(
        <AuthContext.Provider value={loggedInAuthContext}>
            <App />
        </AuthContext.Provider>
    );

    // When logged in, the app should show the main content.
    // We expect to see the "Crea o selecciona una lista" message when there are no lists.
    await waitFor(() => {
        expect(screen.getByText(/Crea o selecciona una lista/i)).toBeInTheDocument();
    });
});