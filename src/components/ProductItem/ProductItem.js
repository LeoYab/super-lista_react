// src/components/ProductItem/ProductItem.js
import React, { useState, useRef } from 'react';
import './ProductItem.css';
import Swal from 'sweetalert2'; // Importa SweetAlert2 (asegúrate de haberlo instalado)

// Importa el componente Button
import Button from '../Buttons/Button';

// onToggleComplete se eliminó de las props, ya que la lógica fue actualizada.
const ProductItem = ({ producto, onEditar, onEliminar, onToggleComplete /* Asegúrate de tener onToggleComplete si lo usas en el span */ }) => {
  const itemTotal = (producto.valor || 0) * (producto.cantidad || 0);

  // Formateo de valores monetarios
  const formattedPrice = (producto.valor || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  const formattedTotal = itemTotal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });


  const timerRef = useRef(null);
  const touchStartCoords = useRef({ x: 0, y: 0 }); // Para almacenar las coordenadas iniciales del toque
  const [isLongPressDetected, setIsLongPressDetected] = useState(false);

  const LONG_PRESS_THRESHOLD = 500; // Milisegundos para detectar una pulsación larga
  const MIN_DRAG_DISTANCE = 15; // Distancia mínima en píxeles para considerar un arrastre (ajustar si es necesario)

  // Función para mostrar la alerta de eliminación (encapsulada para reutilización)
  const confirmDelete = () => {
    Swal.fire({
      title: '¿Estás seguro?',
      text: `¿Quieres eliminar "${producto.nombre}" de la lista?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33', // Rojo para confirmar
      cancelButtonColor: '#3085d6', // Azul para cancelar
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then(async (result) => { // Agrega 'async' aquí por si 'onEliminar' es asíncrona
      if (result.isConfirmed) {
        // Llama a la función para eliminar el producto.
        // Asumiendo que 'onEliminar' manejará su propio SweetAlert de éxito tipo toast,
        // o que lo quieres aquí para una confirmación inmediata si 'onEliminar' no lo hace.
        await onEliminar(producto.firebaseId); // Usa 'await' si onEliminar es asíncrona

        // --- ¡AQUÍ ESTÁ EL CAMBIO CLAVE PARA EL TOAST! ---
        Swal.fire({
          title: '¡Producto Eliminado!',
          icon: 'success',
          showConfirmButton: false, // <-- ¡Importante! Oculta el botón "OK"
          timer: 1500,              // <-- ¡Importante! Cierra automáticamente después de 1.5 segundos
          toast: true,              // <-- ¡Importante! Activa el estilo de notificación pequeña
          position: 'top-end'       // <-- Posiciona el toast en la esquina superior derecha
        });
        // --- FIN DEL CAMBIO CLAVE ---
      }
    });
  };

  // --- NUEVA LÓGICA PARA MANEJAR TOUCH Y DRAG ---
  const handleTouchStart = (e) => {
    // Solo si es un toque de un dedo (para evitar conflictos con zoom, etc.)
    if (e.touches.length === 1) {
      // Almacena las coordenadas iniciales del toque
      touchStartCoords.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      // Limpia cualquier temporizador existente
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setIsLongPressDetected(false); // Reinicia el estado

      // Inicia el temporizador de pulsación larga
      timerRef.current = setTimeout(() => {
        setIsLongPressDetected(true); // Marca que se detectó una pulsación larga
        confirmDelete(); // Muestra la alerta de eliminación
      }, LONG_PRESS_THRESHOLD);
    }
  };

  const handleTouchMove = (e) => {
    if (timerRef.current && e.touches.length === 1) {
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;

      // Calcula la distancia euclidiana (o Manhattan para simplificar si solo interesa cualquier dirección)
      const deltaX = Math.abs(currentX - touchStartCoords.current.x);
      const deltaY = Math.abs(currentY - touchStartCoords.current.y);

      // Si el movimiento excede la distancia mínima, cancela el temporizador de pulsación larga
      if (deltaX > MIN_DRAG_DISTANCE || deltaY > MIN_DRAG_DISTANCE) {
        clearTimeout(timerRef.current);
        timerRef.current = null; // Limpia la referencia
        setIsLongPressDetected(false); // No se considera pulsación larga
      }
    }
  };

  const handleTouchEnd = () => {
    // Siempre limpia el temporizador cuando el dedo se levanta
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // No reseteamos isLongPressDetected aquí directamente si queremos que handleCellClick lo use
  };

  // --- FIN DE LA NUEVA LÓGICA ---


  // Manejadores de eventos de ratón (desktop) - Usan tu lógica original de long press
  const handleMouseDown = (e) => {
    // Evita la propagación si este evento se gestiona a nivel de celda específica
    // e.stopPropagation();

    // Limpia cualquier temporizador existente
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setIsLongPressDetected(false); // Reinicia el estado de detección

    timerRef.current = setTimeout(() => {
      setIsLongPressDetected(true); // Marca que se detectó una pulsación larga
      confirmDelete(); // Muestra la alerta
    }, LONG_PRESS_THRESHOLD);
  };

  const handleMouseUp = (e) => {
    // e.stopPropagation(); // Evita que el evento se propague
    clearTimeout(timerRef.current); // Detiene el temporizador
    timerRef.current = null;
  };

  const handleMouseLeave = (e) => {
    // e.stopPropagation(); // Evita que el evento se propague
    clearTimeout(timerRef.current); // Detiene el temporizador si el mouse sale
    timerRef.current = null;
  };

  const handleCellClick = (e) => {
    e.stopPropagation(); // Evita que el evento se propague a la fila completa

    // Si se detectó una pulsación larga (ya sea táctil o de ratón), no dispares el 'onEditar'
    if (isLongPressDetected) {
      setIsLongPressDetected(false); // Resetea el estado para el próximo evento
      return;
    }
    // Si no fue una pulsación larga, significa que fue un tap/clic normal
    onEditar(producto); // Llama a la función para editar el producto
  };


  return (
    <tr
      className={`product-item-row ${producto.completed ? 'completed' : ''}`}
      // Atributos de eventos para la fila completa (manejo de toque/long press)
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd} // Para cuando el toque se interrumpe (ej. llamada)
      // Nota: onMouseDown/Up/Leave se aplicarán a las celdas individuales para su clic/long press
    >
      {/* Celdas para Producto, Cantidad, Precio y Total: Tap para editar, Mantener para eliminar */}
      {/* Usamos onClick para el tap/clic normal y onMouseDown/Up/Leave para long press en desktop */}
      <td
        className="product-cell product-name-cell clickable-cell"
        onClick={handleCellClick} // Tap/clic para editar
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <span
          className="product-name-text"
          onClick={(e) => {
            e.stopPropagation(); // Evita que el clic en el texto propague al handleCellClick de la TD
            if (onToggleComplete) { // Solo si la prop existe
              onToggleComplete(producto.firebaseId);
            }
          }}
          style={{ textDecoration: producto.completed ? 'line-through' : 'none' }}
        >
          {producto.icon && <span className="product-icon">{producto.icon}</span>}
          {producto.nombre}
        </span>
      </td>

      <td
        className="product-cell product-quantity-cell clickable-cell"
        onClick={handleCellClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {producto.cantidad}
      </td>

      <td
        className="product-cell product-price-cell clickable-cell"
        onClick={handleCellClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {formattedPrice}
      </td>

      <td
        className="product-cell product-item-total-cell clickable-cell"
        onClick={handleCellClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {formattedTotal}
      </td>

      {/* Celda para los Botones de Acción - Se mostrará en pantallas más grandes */}
      <td className="product-cell product-actions-cell desktop-only-actions">
        <div className="product-buttons">
          {/* Botón de Editar con el componente Button */}
          <Button
            className="round"
            onClick={(e) => {
              e.stopPropagation(); // Evita que el evento burbujee a la fila
              onEditar(producto); // Llama a la función de edición
            }}
            title="Editar producto"
            icon="✏️"
            variant="ghost"
            size="small"
          />
          {/* Botón de Eliminar con el componente Button */}
          <Button
            className="round"
            onClick={(e) => {
              e.stopPropagation(); // Evita que el evento burbujee
              // Abre SweetAlert directamente en el clic para desktop/botón
              confirmDelete(); // Usa la función común de confirmación
            }}
            title="Eliminar producto"
            icon="🗑️"
            variant="danger"
            size="small"
          />
        </div>
      </td>
    </tr>
  );
};

export default ProductItem;