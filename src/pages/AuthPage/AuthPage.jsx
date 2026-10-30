// src/pages/AuthPage/AuthPage.js
import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './AuthPage.css';

import Input from '../../components/Input/Input';
import Button from '../../components/Buttons/Button';
import { useTheme } from '../../hooks/useTheme';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
  </svg>
);

function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [googleLoading, setGoogleLoading] = useState(false);

  const { signup, login, loginWithGoogle } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signup(email, password);
      }
    } catch (err) {
      if (err.code === 'auth/invalid-email') {
        setError('El formato del correo electrónico no es válido.');
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Correo electrónico o contraseña incorrectos.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este correo electrónico ya está registrado.');
      } else if (err.code === 'auth/weak-password') {
        setError('La contraseña debe tener al menos 6 caracteres.');
      } else {
        setError('Error al autenticar. Por favor, inténtalo de nuevo.');
        console.error('Error de autenticación:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);

    try {
      await loginWithGoogle();
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // El usuario cerró el popup: no es un error que deba mostrarse.
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        setError('Ese correo ya está registrado con otro método de inicio de sesión.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Este sitio no está autorizado para iniciar sesión con Google. Agregá el dominio en Firebase Console > Authentication > Settings > Authorized domains.');
        console.error('Error de autenticación con Google:', err);
      } else {
        setError('No se pudo iniciar sesión con Google. Por favor, inténtalo de nuevo.');
        console.error('Error de autenticación con Google:', err);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      <Button
        onClick={toggleTheme}
        variant="ghost"
        size="small"
        title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        icon={theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        className="auth-theme-toggle"
      />
      <div>
        <div className="auth-brand">
          <img src="/logo.svg" alt="Super Lista" className="auth-brand-icon" />
          <span className="auth-brand-title">Super Lista</span>
        </div>

        <div className="auth-form-card">
          <h2>{isLogin ? 'Bienvenido de nuevo' : 'Creá tu cuenta'}</h2>
          <p className="auth-form-subtitle">
            {isLogin ? 'Iniciá sesión para ver tus listas' : 'Registrate para empezar a organizar tus compras'}
          </p>

          {error && (
            <p className="auth-error">
              <AlertCircle size={16} />
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit}>
            <Input
              label="Email"
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="tu@email.com"
              autoComplete="email"
            />

            <div className="auth-password-field">
              <Input
                label="Contraseña"
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                minLength={6}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <Button type="submit" disabled={loading || googleLoading} variant="primary" className="auth-submit-btn" size="large">
              {loading ? 'Cargando...' : (isLogin ? 'Iniciar Sesión' : 'Registrarse')}
            </Button>
          </form>

          <div className="auth-divider">
            <span>{isLogin ? 'o iniciá sesión con' : 'o registrate con'}</span>
          </div>

          <Button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading || googleLoading}
            variant="secondary"
            className="auth-google-btn"
            size="large"
            icon={<GoogleIcon />}
          >
            {googleLoading ? 'Conectando...' : (isLogin ? 'Iniciar sesión con Google' : 'Registrarse con Google')}
          </Button>

          <p className="toggle-auth">
            {isLogin ? '¿No tenés una cuenta?' : '¿Ya tenés una cuenta?'}
            <span onClick={() => { setIsLogin(!isLogin); setError(''); }} className="toggle-auth-link">
              {isLogin ? ' Registrate' : ' Iniciá sesión'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default AuthPage;
