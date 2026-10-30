# 🛒 SuperLista React 🛒

¡Bienvenido a SuperLista! Una aplicación web moderna e interactiva para gestionar tus listas de compras de manera eficiente y amigable. Creada con React, esta aplicación ofrece una experiencia de usuario fluida tanto en escritorio como en dispositivos móviles.

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)
![SweetAlert2](https://img.shields.io/badge/SweetAlert2-1f2937?style=for-the-badge&logo=sweetalert2&logoColor=white)

## ✨ Características Principales

-   **Gestión Completa de Productos:** Añade, edita y elimina productos de tu lista con facilidad.
-   **Marcar como Completado:** Tacha los productos que ya has añadido a tu carrito con un solo clic.
-   **Cálculos Automáticos:** La aplicación calcula el precio total por producto y el costo total de tu lista.
-   **Interfaz Intuitiva:** Un diseño limpio y centrado en la usabilidad.
-   **📱 Experiencia Móvil Optimizada:** ¡Desliza para actuar! En dispositivos móviles, puedes deslizar un producto hacia la izquierda para eliminarlo o hacia la derecha para editarlo, haciendo la gestión de la lista rápida y natural.
-   **Notificaciones Amigables:** Confirmaciones y alertas visuales para las acciones importantes, como eliminar un producto.
-   **Diseño Responsivo:** Se adapta perfectamente a cualquier tamaño de pantalla.

---

## 🚀 Cómo Empezar

Sigue estos pasos para configurar y ejecutar el proyecto en tu entorno de desarrollo local.

### Pre-requisitos

Asegúrate de tener instalado Node.js y npm en tu sistema.
-   [Node.js](https://nodejs.org/) (versión 16 o superior recomendada)
-   npm (se instala automáticamente con Node.js)

### Instalación y Ejecución

1.  **Clona el repositorio:**
    ```bash
    git clone https://github.com/tu-usuario/SuperLista-React.git
    ```
    *(Reemplaza `tu-usuario` con tu nombre de usuario de GitHub si lo subes a un repositorio).*

2.  **Navega al directorio del proyecto:**
    ```bash
    cd SuperLista-React
    ```

3.  **Instala las dependencias:**
    Este comando leerá el archivo `package.json` e instalará todas las librerías necesarias para el proyecto.
    ```bash
    npm install
    ```

4.  **Inicia el servidor de desarrollo:**
    Este comando ejecutará la aplicación en modo de desarrollo.
    ```bash
    npm start
    ```

5.  **¡Abre la aplicación!**
    Abre http://localhost:3000 en tu navegador para ver la aplicación en acción. La página se recargará automáticamente cada vez que hagas cambios en el código.

---

## 📜 Scripts Disponibles

In the project directory, you can run:

### `npm start`

Ejecuta la aplicación en modo de desarrollo.

### `npm test`

Ejecuta las pruebas una vez con Vitest (`npm run test:watch` para modo interactivo).

### `npm run build`

Compila la aplicación para producción en la carpeta `build`. Esto empaqueta React en modo de producción y optimiza la compilación para obtener el mejor rendimiento.

---

## 🏗️ Estructura del Proyecto (Simplificada)

```
superlista/
├── index.html
├── public/
├── src/
│   ├── components/
│   │   ├── ProductItem/
│   │   │   └── ProductItem.js      # Componente principal de cada ítem de la lista
│   │   └── ...
│   ├── hooks/
│   │   └── useSwipeable.js         # Hook personalizado para la funcionalidad de swipe
│   ├── Notifications/
│   │   └── NotificationsServices.js # Servicio para mostrar alertas
│   ├── App.js
│   └── index.js
├── package.json
└── readme.md
```

---

¡Gracias por revisar SuperLista! Si tienes alguna sugerencia o encuentras un error, no dudes en abrir un *issue*.