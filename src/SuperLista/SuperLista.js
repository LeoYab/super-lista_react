import React, { useState, useEffect } from 'react';
import Header from '../components/Header/Header';
import SearchBar from '../components/SearchBar/SearchBar';
import ProductForm from '../components/ProductForm/ProductForm';
import ProductList from '../components/ProductList/ProductList';
import TotalSummary from '../TotalSummary/TotalSummary';
import { productService } from '../services/productService';
import './SuperLista.css';

const SuperLista = () => {
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  // Cargar productos al montar el componente
  useEffect(() => {
    const productosGuardados = productService.obtenerProductos();
    setProductos(productosGuardados);
  }, []);

  // Guardar productos cuando cambie el estado
  useEffect(() => {
    productService.guardarProductos(productos);
  }, [productos]);

  const agregarProducto = (nuevoProducto) => {
    const producto = {
      id: Date.now(),
      ...nuevoProducto,
      total: nuevoProducto.valor * nuevoProducto.cantidad
    };
    setProductos([...productos, producto]);
    setMostrarFormulario(false);
  };

  const editarProducto = (id, productoEditado) => {
    const productoActualizado = {
      ...productoEditado,
      id: id,
      total: productoEditado.valor * productoEditado.cantidad
    };
    setProductos(productos.map(p => p.id === id ? productoActualizado : p));
    setEditandoId(null);
    setMostrarFormulario(false);
  };

  const eliminarProducto = (id) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este producto?')) {
      setProductos(productos.filter(p => p.id !== id));
    }
  };

  const iniciarEdicion = (producto) => {
    setEditandoId(producto.id);
    setMostrarFormulario(true);
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setMostrarFormulario(false);
  };

  const productosFiltrados = productos.filter(producto =>
    producto.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const totalGeneral = productos.reduce((sum, producto) => sum + producto.total, 0);

  return (
    <div className="super-lista">
      <div className="container">
        <Header />
        
        <div className="controls-section card">
          <SearchBar 
            busqueda={busqueda}
            setBusqueda={setBusqueda}
            mostrarFormulario={mostrarFormulario}
            setMostrarFormulario={setMostrarFormulario}
            onCancelar={cancelarEdicion}
          />
          <TotalSummary total={totalGeneral} />
        </div>

        {mostrarFormulario && (
          <ProductForm
            editandoId={editandoId}
            productoAEditar={productos.find(p => p.id === editandoId)}
            onAgregar={agregarProducto}
            onEditar={editarProducto}
            onCancelar={cancelarEdicion}
          />
        )}

        <ProductList
          productos={productosFiltrados}
          busqueda={busqueda}
          onEditar={iniciarEdicion}
          onEliminar={eliminarProducto}
        />
      </div>
    </div>
  );
};

export default SuperLista;