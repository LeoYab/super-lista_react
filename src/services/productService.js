

const obtenerProductos = () => {
  const productosGuardados = localStorage.getItem('productos');
  return productosGuardados ? JSON.parse(productosGuardados) : [];
}  
const guardarProductos = (productos) => {
  localStorage.setItem('productos', JSON.stringify(productos));
};
const eliminarProducto = (id) => {
  const productos = obtenerProductos();
  const productosActualizados = productos.filter(producto => producto.id !== id);
  guardarProductos(productosActualizados);
};
const agregarProducto = (producto) => {
  const productos = obtenerProductos();
  const nuevoProducto = { ...producto, id: Date.now() };
  guardarProductos([...productos, nuevoProducto]);
};
const editarProducto = (id, productoEditado) => {
  const productos = obtenerProductos();
  const productosActualizados = productos.map(producto =>
    producto.id === id ? { ...producto, ...productoEditado } : producto
  );
  guardarProductos(productosActualizados);
};
export const productService = {
  obtenerProductos,
  guardarProductos,
  eliminarProducto,
  agregarProducto,
  editarProducto
};
export default productService;