// src/pages/AuthPage/AuthPage.js
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './AuthPage.css'; // Asegúrate de que este archivo CSS exista

// Importa tus componentes UI
import Input from '../../components/Input/Input';
import Button from '../../components/Buttons/Button';

function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true); // true para login, false para registro
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signup, login } = useAuth(); // Asumiendo que useAuth proporciona estas funciones

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); // Limpia errores previos
    setLoading(true); // Inicia el estado de carga

    try {
      if (isLogin) {
        await login(email, password);
        // Opcional: Redirigir al usuario después de un login exitoso
        // history.push('/dashboard'); // Si usas react-router-dom y tienes acceso a history
      } else {
        await signup(email, password);
        // Opcional: Redirigir o notificar después de un registro exitoso
      }
    } catch (err) {
      // Manejo de errores específicos de Firebase Auth
      if (err.code === 'auth/invalid-email') {
        setError('El formato del correo electrónico no es válido.');
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Correo electrónico o contraseña incorrectos.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este correo electrónico ya está registrado.');
      } else if (err.code === 'auth/weak-password') {
        setError('La contraseña debe tener al menos 6 caracteres.');
      } else {
        // Error genérico
        setError('Error al autenticar. Por favor, inténtalo de nuevo.');
        console.error("Error de autenticación:", err);
      }
    } finally {
      setLoading(false); // Finaliza el estado de carga
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-form-card">
        <h2>{isLogin ? 'Iniciar Sesión' : 'Registrarse'}</h2>
        {/* Muestra el mensaje de error si existe */}
        {error && <p className="auth-error">{error}</p>}
        <form onSubmit={handleSubmit}>
          {/* Componente Input para el Email */}
          <Input
            label="Email:"
            id="email"
            name="email" // Importante para la coherencia, aunque no se use en este handleChange directo
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="tu@email.com" // Añadido para mejor UX
          />
          {/* Componente Input para la Contraseña */}
          <Input
            label="Contraseña:"
            id="password"
            name="password" // Importante para la coherencia
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="******" // Añadido para mejor UX
          />
          {/* Componente Button para el envío del formulario */}
          <Button type="submit" disabled={loading} variant="primary">
            {loading ? 'Cargando...' : (isLogin ? 'Iniciar Sesión' : 'Registrarse')}
          </Button>
        </form>
        <p className="toggle-auth">
          {isLogin ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}
          {/* Usamos un span para el texto que cambia, mejor para semántica y clic */}
          <span onClick={() => setIsLogin(!isLogin)} className="toggle-auth-link">
            {isLogin ? ' Regístrate' : ' Inicia Sesión'}
          </span>
        </p>
      </div>
    </div>
  );
}

export default AuthPage;