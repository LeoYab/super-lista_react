// src/setupProxy.js
// Configura el servidor de desarrollo de React (webpack-dev-server)
// para que actúe como proxy hacia las APIs de los supermercados.
// Esto elimina los problemas de CORS porque el navegador ve las peticiones
// como del mismo origen (localhost:3000).

const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy para Carrefour
  app.use(
    '/proxy-api/carrefour',
    createProxyMiddleware({
      target: 'https://www.carrefour.com.ar',
      changeOrigin: true,
      pathRewrite: { '^/proxy-api/carrefour': '' },
      secure: true,
    })
  );

  // Proxy para Día
  app.use(
    '/proxy-api/dia',
    createProxyMiddleware({
      target: 'https://diaonline.supermercadosdia.com.ar',
      changeOrigin: true,
      pathRewrite: { '^/proxy-api/dia': '' },
      secure: true,
    })
  );

  // Proxy para Changomas / Más Online
  app.use(
    '/proxy-api/changomas',
    createProxyMiddleware({
      target: 'https://www.masonline.com.ar',
      changeOrigin: true,
      pathRewrite: { '^/proxy-api/changomas': '' },
      secure: true,
    })
  );
};
