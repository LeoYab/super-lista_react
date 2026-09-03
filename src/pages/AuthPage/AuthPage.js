// src/pages/AuthPage/AuthPage.js
import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './AuthPage.css';

import Input from '../../components/Input/Input';
import Button from '../../components/Buttons/Button';
import { useTheme } from '../../hooks/useTheme';

function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signup, login } = useAuth();
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

            <Button type="submit" disabled={loading} variant="primary" className="auth-submit-btn" size="large">
              {loading ? 'Cargando...' : (isLogin ? 'Iniciar Sesión' : 'Registrarse')}
            </Button>
          </form>

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
