// src/Notifications/NotificationsServices.js
import Swal from 'sweetalert2';

/**
 * Muestra una notificación de éxito tipo 'toast' que desaparece automáticamente.
 * Ideal para confirmaciones rápidas (ej: "Producto añadido").
 * @param {string} title - El título del mensaje de éxito.
 */
export const showSuccessToast = (htmlTitle) => {
  Swal.fire({
    title: htmlTitle,
    icon: 'success',
    showConfirmButton: false,
    timer: 1500,
    toast: true,
    position: 'top-end',
    customClass: {
      popup: 'swal2-toast-popup' // Opcional: para estilos específicos si es necesario
    }
  });
};

/**
 * Muestra una alerta de éxito estándar con un botón de confirmación.
 * @param {string} title - El título de la alerta.
 * @param {string} [text=''] - El texto descriptivo (opcional).
 */
export const showSuccessAlert = (title, text = '') => {
  Swal.fire({
    title: title,
    text: text,
    icon: 'success',
    confirmButtonText: 'Ok'
  });
};

/**
 * Muestra una alerta de error estándar.
 * @param {string} title - El título de la alerta de error.
 * @param {string} [text=''] - El texto descriptivo (opcional).
 */
export const showErrorAlert = (title, text = '') => {
  Swal.fire({
    title: 'Error',
    text: text || 'Ha ocurrido un error inesperado.',
    icon: 'error',
    confirmButtonText: 'Entendido'
  });
};

/**
 * Muestra una alerta de confirmación con opciones de "Sí" y "Cancelar".
 * @param {object} options - Objeto con opciones para la alerta.
 * @param {string} options.title - El título de la alerta de confirmación.
 * @param {string} options.text - El texto descriptivo de la alerta.
 * @param {string} [options.confirmButtonText='Sí'] - Texto del botón de confirmación.
 * @param {string} [options.cancelButtonText='Cancelar'] - Texto del botón de cancelar.
 * @returns {Promise<boolean>} Resuelve a `true` si el usuario confirma, `false` si cancela.
 */
export const showConfirmAlert = async ({
  title,
  text,
  confirmButtonText = 'Sí',
  cancelButtonText = 'Cancelar'
}) => {
  const result = await Swal.fire({
    title: title,
    text: text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: confirmButtonText,
    cancelButtonText: cancelButtonText
  });
  return result.isConfirmed;
};

// Puedes añadir más funciones aquí según necesites otros tipos de SweetAlerts.