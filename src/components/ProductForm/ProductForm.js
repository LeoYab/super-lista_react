// src/components/ProductForm/ProductForm.js
import React, { useState, useEffect, useRef } from 'react';
import './ProductForm.css';
import Input from '../Input/Input';
import Select from '../Select/Select';
import Button from '../Buttons/Button';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

// IMPORT NEW SERVICE: Importa tus funciones de notificación
import { showErrorAlert, showSuccessToast } from '../../Notifications/NotificationsServices';

// Import local product data for scanner lookup
import carrefourDefaultProducts from '../../data/products/carrefour/1.json';
import diaDefaultProducts from '../../data/products/dia/87.json';
import changomasDefaultProducts from '../../data/products/changomas/1004.json';

const LOCAL_BRAND_DEFAULT_PRODUCTS_MAP = {
  carrefour: carrefourDefaultProducts,
  dia: diaDefaultProducts,
  changomas: changomasDefaultProducts,
};

// Nos aseguramos de que 'categories' siempre sea un array, incluso si es vacío.
const ProductForm = ({ editandoId, productoAEditar, onAgregar, onEditar, onCancelar, categories = [] }) => {

  // Definimos una categoría de respaldo por si no hay categorías cargadas.
  const fallbackDefaultCategory = { id: 0, title: 'Sin Categoría', icon: '🔤', icons: ['🔤'] };

  // Buscamos la categoría 'Otros' o la primera categoría si existe.
  // Si 'categories' está vacío, 'find' devolverá undefined y categories[0] será undefined.
  // En ese caso, usamos 'fallbackDefaultCategory'.
  const otrosCategory = categories.find(cat => cat.title === 'Otros');
  const initialDefaultCategory = otrosCategory || categories[0] || fallbackDefaultCategory;

  const [productData, setProductData] = useState({
    nombre: '',
    valor: '',
    cantidad: '',
    category: initialDefaultCategory.id, // Usamos la categoría inicial para el estado.
    icon: initialDefaultCategory.icon
  });
  const [error, setError] = useState('');

  // Scanner states
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef(null);
  const scannerIsRunningRef = useRef(false);

  // Efecto para inicializar o resetear el formulario.
  useEffect(() => {
    if (editandoId && productoAEditar) {
      const loadedCategory = typeof productoAEditar.category === 'string'
        ? parseInt(productoAEditar.category, 10)
        : productoAEditar.category;

      setProductData({
        nombre: productoAEditar.nombre,
        valor: productoAEditar.valor.toString(),
        cantidad: productoAEditar.cantidad.toString(),
        category: loadedCategory || initialDefaultCategory.id,
        icon: productoAEditar.icon || initialDefaultCategory.icon
      });
    } else {
      // Si no estamos editando, reiniciamos el formulario a sus valores por defecto
      // usando la categoría inicial que ya está garantizada como válida.
      setProductData({
        nombre: '',
        valor: '',
        cantidad: '',
        category: initialDefaultCategory.id,
        icon: initialDefaultCategory.icon
      });
      setError('');
    }
  }, [editandoId, productoAEditar, initialDefaultCategory]); // Dependencia actualizada a initialDefaultCategory

  // --- Barcode Scanner Logic ---
  const normalizeCode = (code) => {
    return code.replace(/^0+/, '');
  };

  const onScanSuccess = (decodedText, decodedResult) => {
    console.log(`Code scanned = ${decodedText}`, decodedResult);

    // Stop scanning
    setShowScanner(false);

    const normalizedScannedCode = normalizeCode(decodedText);
    console.log(`Normalized scanned code: ${normalizedScannedCode}`);

    // Search for the product in all local data
    let foundProduct = null;
    for (const products of Object.values(LOCAL_BRAND_DEFAULT_PRODUCTS_MAP)) {
      foundProduct = products.find(p => {
        // ID format usually: "EAN-BranchID" or "PaddedEAN-BranchID"
        const idParts = p.id.split('-');
        if (idParts.length > 0) {
          const idCodePart = idParts[0]; // Get the EAN part
          const normalizedIdCode = normalizeCode(idCodePart);
          return normalizedIdCode === normalizedScannedCode;
        }
        return false;
      });
      if (foundProduct) break;
    }

    if (foundProduct) {
      if (editandoId) {
        setProductData(prev => ({
          ...prev,
          nombre: foundProduct.nombre,
          valor: foundProduct.precio ? foundProduct.precio.toString() : prev.valor,
        }));
        showSuccessToast(`Producto actualizado: ${foundProduct.nombre}`);
      } else {
        // Find 'Otros' category or fallback
        const targetCategory = otrosCategory || categories[0] || fallbackDefaultCategory;

        setProductData(prev => ({
          ...prev,
          nombre: foundProduct.nombre,
          valor: foundProduct.precio ? foundProduct.precio.toString() : '',
          cantidad: '1',
          category: targetCategory.id,
          icon: targetCategory.icon
        }));
        showSuccessToast(`Producto encontrado: ${foundProduct.nombre}`);
      }
    } else {
      showErrorAlert('Producto no encontrado', `No se encontró información para el código: ${decodedText}. Puedes ingresarlo manualmente.`);
      // Optionally fill the name with the code or leave it to the user
    }
  };

  const handleCloseScanner = () => {
    setShowScanner(false);
  };

  useEffect(() => {
    let html5QrCode;
    if (showScanner) {
      // Small timeout to ensure DOM element exists
      const timer = setTimeout(() => {
        html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;
        scannerIsRunningRef.current = false;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128
          ]
        };

        Html5Qrcode.getCameras().then(devices => {
          if (devices && devices.length) {
            return html5QrCode.start(
              { facingMode: "environment" },
              config,
              onScanSuccess,
              () => { }
            );
          } else {
            throw new Error("No se detectaron cámaras.");
          }
        })
          .then(() => {
            scannerIsRunningRef.current = true;
          })
          .catch(err => {
            console.error("Error starting scanner:", err);
            let userMsg = `No se pudo iniciar la cámara.`;

            if (err.name === 'NotReadableError' || err.message?.includes('NotReadableError')) {
              userMsg = "La cámara parece estar en uso por otra aplicación o hay un fallo de hardware.";
            } else if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
              userMsg = "Permiso denegado. Habilita el acceso a la cámara.";
            } else if (err.name === 'NotFoundError') {
              userMsg = "No se encontró ninguna cámara.";
            }

            showErrorAlert('Error de Cámara', userMsg);
            setShowScanner(false);
          });
      }, 100);

      return () => {
        clearTimeout(timer);
        if (html5QrCode) {
          const stopScanner = async () => {
            if (scannerIsRunningRef.current) {
              try {
                await html5QrCode.stop();
              } catch (err) {
                console.warn("Error stopping scanner:", err);
              }
            }
            try {
              html5QrCode.clear();
            } catch (e) {
              console.warn("Error clearing scanner:", e);
            }
            scannerIsRunningRef.current = false;
          };
          stopScanner();
        }
      };
    }
  }, [showScanner]);


  const handleChange = (e) => {
    const { name, value } = e.target;
    setProductData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleIncrement = () => {
    setProductData(prev => ({
      ...prev,
      cantidad: (parseInt(prev.cantidad || 0, 10) + 1).toString()
    }));
  };

  const handleDecrement = () => {
    setProductData(prev => {
      const current = parseInt(prev.cantidad || 0, 10);
      if (current <= 1) return prev;
      return {
        ...prev,
        cantidad: (current - 1).toString()
      };
    });
  };

  const handleCategoryChange = (e) => {
    const selectedCategoryId = parseInt(e.target.value, 10);
    // Aseguramos que 'categories' es un array antes de usar 'find'
    const selectedCat = categories.find(cat => cat.id === selectedCategoryId);

    setProductData(prev => ({
      ...prev,
      category: selectedCategoryId,
      // Si la categoría seleccionada tiene íconos, usa el primero. Si no, usa el ícono de la categoría misma.
      // Si 'selectedCat' es undefined (lo cual no debería pasar con el 'required' en el Select), usa el fallback.
      icon: selectedCat ? (selectedCat.icons && selectedCat.icons[0] ? selectedCat.icons[0] : selectedCat.icon) : fallbackDefaultCategory.icon
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!productData.nombre.trim() || !productData.valor || !productData.cantidad || productData.category === undefined || !productData.icon) {
      setError('Todos los campos son obligatorios.');
      showErrorAlert('Error', 'Por favor, completa todos los campos.'); // Replaced Swal.fire
      return;
    }
    setError('');

    const parsedValor = parseFloat(productData.valor);
    const parsedCantidad = parseInt(productData.cantidad, 10);

    if (isNaN(parsedValor) || parsedValor < 0) {
      setError('El valor unitario debe ser un número positivo.');
      showErrorAlert('Error', 'El valor unitario debe ser un número positivo.'); // Replaced Swal.fire
      return;
    }
    if (isNaN(parsedCantidad) || parsedCantidad < 1) {
      setError('La cantidad debe ser un número entero positivo.');
      showErrorAlert('Error', 'La cantidad debe ser un número entero positivo.'); // Replaced Swal.fire
      return;
    }

    const dataToSubmit = {
      nombre: productData.nombre.trim(),
      valor: parsedValor,
      cantidad: parsedCantidad,
      category: productData.category,
      icon: productData.icon,
    };

    if (editandoId) {
      onEditar(editandoId, dataToSubmit);
    } else {
      onAgregar(dataToSubmit);
    }

    // Reinicia el formulario al estado inicial después de enviar
    setProductData({
      nombre: '',
      valor: '',
      cantidad: '',
      category: initialDefaultCategory.id,
      icon: initialDefaultCategory.icon
    });
  };

  // Prepara las opciones para el componente Select de Categoría
  // Garantizamos que 'categories' es un array antes de mapear.
  const categoryOptions = categories.map(cat => ({
    value: cat.id,
    label: `${cat.icon} ${cat.title}`
  }));

  return (
    <div className="product-form-container card">
      <h3>{editandoId ? 'Editar Producto' : 'Agregar Nuevo Producto'}</h3>

      {/* Scanner Button */}
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
        <Button type="button" variant="secondary" onClick={() => setShowScanner(true)}>
          📷 Escanear Producto
        </Button>
      </div>

      {error && <p className="form-error">{error}</p>}
      <form onSubmit={handleSubmit}>
        <Input
          label="Nombre del Producto:"
          id="nombre"
          name="nombre"
          value={productData.nombre}
          onChange={handleChange}
          placeholder="Ej: Leche, Pan, Arroz"
          maxLength={23}
          required
        />

        <Input
          label="Valor Unitario ($):"
          id="valor"
          name="valor"
          type="number"
          value={productData.valor}
          onChange={handleChange}
          placeholder="Ej: 1.50, 25.75"
          step="0.01"
          min="0"
          required
        />

        <div className="input-group">
          <label htmlFor="cantidad">Cantidad:</label>
          <div className="quantity-controls">
            <button type="button" onClick={handleDecrement} className="qty-btn">-</button>
            <input
              id="cantidad"
              name="cantidad"
              type="number"
              value={productData.cantidad}
              onChange={handleChange}
              placeholder="Ej: 1, 2, 5"
              min="1"
              required
              className="input-field qty-input"
            />
            <button type="button" onClick={handleIncrement} className="qty-btn">+</button>
          </div>
        </div>

        <Select
          label="Categoría:"
          id="category"
          name="category"
          value={productData.category}
          onChange={handleCategoryChange}
          options={[...categoryOptions]}
          required
        />

        <div className="form-actions">
          <Button type="submit" variant="primary">
            {editandoId ? 'Guardar Cambios' : 'Agregar Producto'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </form>

      {/* Scanner Modal */}
      {showScanner && (
        <div className="scanner-modal-overlay">
          <div className="scanner-modal-content">
            <h3>Escanear Código de Barras</h3>
            <div id="reader"></div>
            <div className="scanner-actions" style={{ marginTop: '20px' }}>
              <Button onClick={handleCloseScanner} variant="secondary">
                Cerrar Escáner
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductForm;