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
    // Colored via the .swal2-confirm-danger / .swal2-cancel CSS classes
    // (App.css) instead of inline colors, so the buttons follow the app's
    // theme tokens rather than a hardcoded palette.
    customClass: { confirmButton: 'swal2-confirm-danger' },
    confirmButtonText: confirmButtonText,
    cancelButtonText: cancelButtonText
  });
  return result.isConfirmed;
};

/**
 * Muestra una alerta con un campo de entrada de texto (input prompt) usando SweetAlert2.
 * @param {object} options - Opciones de la alerta.
 * @param {string} options.title - Título.
 * @param {string} [options.inputPlaceholder=''] - Placeholder del campo.
 * @param {string} [options.inputValue=''] - Valor inicial.
 * @param {string} [options.confirmButtonText='Aceptar'] - Texto del botón de confirmar.
 * @param {string} [options.cancelButtonText='Cancelar'] - Texto del botón de cancelar.
 * @returns {Promise<string|null>} El texto ingresado o null si se canceló.
 */
export const showInputAlert = async ({
  title,
  inputPlaceholder = '',
  inputValue = '',
  confirmButtonText = 'Aceptar',
  cancelButtonText = 'Cancelar'
}) => {
  const result = await Swal.fire({
    title: title,
    input: 'text',
    inputPlaceholder: inputPlaceholder,
    inputValue: inputValue,
    showCancelButton: true,
    // Colored via the .swal2-confirm / .swal2-cancel CSS defaults (App.css).
    confirmButtonText: confirmButtonText,
    cancelButtonText: cancelButtonText,
    inputValidator: (value) => {
      if (!value || !value.trim()) {
        return '¡Debes ingresar un nombre!';
      }
    }
  });
  return result.isConfirmed ? result.value : null;
};

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 999;

const ARROW_UP_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"></polyline></svg>';
const ARROW_DOWN_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';

// Own markup instead of SweetAlert2's built-in `input`: it looks the input up
// as a *direct child* of the popup, so moving it inside the arrows wrapper
// made every value read as null. Static string only; the product name is
// added with textContent in didOpen so it can never be interpreted as HTML.
const QUANTITY_DIALOG_HTML = `
  <p class="qty-product-name"></p>
  <div class="qty-stepper">
    <input class="swal2-input qty-input" type="text" inputmode="numeric" pattern="[0-9]*"
      maxlength="${String(MAX_QUANTITY).length}" autocomplete="off" aria-label="Cantidad" />
    <div class="qty-stepper-arrows">
      <button type="button" class="qty-stepper-arrow" data-dir="up" aria-label="Aumentar cantidad">${ARROW_UP_SVG}</button>
      <button type="button" class="qty-stepper-arrow" data-dir="down" aria-label="Disminuir cantidad">${ARROW_DOWN_SVG}</button>
    </div>
  </div>`;

const readQuantity = (input) => parseInt(input.value, 10);

/**
 * Pregunta cuántas unidades agregar de un producto, con flechas para subir o
 * bajar de a 1. Solo se pueden escribir dígitos, y las flechas se deshabilitan
 * en los límites (1 y 999), así nunca dejan un número inválido.
 * @param {object} [options]
 * @param {string} [options.productName=''] - Nombre del producto, se muestra como texto de apoyo.
 * @param {number} [options.defaultQuantity=1] - Cantidad inicial.
 * @returns {Promise<number|null>} La cantidad (entero entre 1 y 999) o null si se canceló.
 */
export const showQuantityAlert = async ({ productName = '', defaultQuantity = 1 } = {}) => {
  const result = await Swal.fire({
    title: '¿Cuántas unidades?',
    html: QUANTITY_DIALOG_HTML,
    showCancelButton: true,
    confirmButtonText: 'Agregar',
    cancelButtonText: 'Cancelar',
    focusConfirm: false,
    didOpen: (popup) => {
      const input = popup.querySelector('.qty-input');
      const up = popup.querySelector('[data-dir="up"]');
      const down = popup.querySelector('[data-dir="down"]');
      popup.querySelector('.qty-product-name').textContent = productName;
      input.value = String(defaultQuantity);

      const refresh = () => {
        const value = readQuantity(input);
        up.disabled = Number.isFinite(value) && value >= MAX_QUANTITY;
        down.disabled = Number.isFinite(value) && value <= MIN_QUANTITY;
      };
      const step = (delta) => {
        const value = readQuantity(input);
        const next = Number.isFinite(value)
          ? Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, value + delta))
          : MIN_QUANTITY;
        if (next === value) return;
        input.value = String(next);
        Swal.resetValidationMessage();
        refresh();
      };

      up.addEventListener('click', () => step(1));
      down.addEventListener('click', () => step(-1));
      input.addEventListener('input', () => {
        // Only digits (no signs, decimals, "e" or letters), typed or pasted.
        const digits = input.value.replace(/\D/g, '').slice(0, String(MAX_QUANTITY).length);
        if (digits !== input.value) input.value = digits;
        Swal.resetValidationMessage();
        refresh();
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowUp') { event.preventDefault(); step(1); }
        else if (event.key === 'ArrowDown') { event.preventDefault(); step(-1); }
        else if (event.key === 'Enter') { event.preventDefault(); Swal.clickConfirm(); }
      });

      refresh();
      input.focus();
      // Select the default so typing replaces it directly.
      input.select();
    },
    preConfirm: () => {
      const quantity = readQuantity(Swal.getPopup().querySelector('.qty-input'));
      if (!Number.isInteger(quantity) || quantity < MIN_QUANTITY) {
        Swal.showValidationMessage(`Ingresá una cantidad de ${MIN_QUANTITY} o más.`);
        return false;
      }
      if (quantity > MAX_QUANTITY) {
        Swal.showValidationMessage(`La cantidad máxima es ${MAX_QUANTITY}.`);
        return false;
      }
      return quantity;
    }
  });
  return result.isConfirmed ? result.value : null;
};

// Puedes añadir más funciones aquí según necesites otros tipos de SweetAlerts.