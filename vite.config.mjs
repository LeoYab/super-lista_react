import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// Proxies de desarrollo hacia las APIs de los supermercados (evita CORS).
// En producción cumple esta función api/supermarket-proxy.js.
const PROXY_TARGETS = {
  carrefour: 'https://www.carrefour.com.ar',
  dia: 'https://diaonline.supermercadosdia.com.ar',
  changomas: 'https://www.masonline.com.ar',
  jumbo: 'https://www.jumbo.com.ar',
  vea: 'https://www.vea.com.ar',
};

const proxy = Object.fromEntries(
  Object.entries(PROXY_TARGETS).map(([brand, target]) => [
    `/proxy-api/${brand}`,
    {
      target,
      changeOrigin: true,
      secure: true,
      rewrite: (path) => path.replace(`/proxy-api/${brand}`, ''),
    },
  ])
);

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // `npm run start-https`: la cámara del escáner exige HTTPS fuera de localhost.
    mode === 'https' && basicSsl(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.js',
      // Se registra a mano en serviceWorkerRegistration.js y se usa public/manifest.json.
      injectRegister: false,
      manifest: false,
      injectManifest: {
        // Solo el app shell: public/data/*.json no se precachea, los precios vienen de la red.
        globPatterns: ['**/*.{js,css,html}'],
      },
    }),
  ],
  // Se conservan los nombres REACT_APP_* para no cambiar los secretos de Vercel y GitHub.
  envPrefix: 'REACT_APP_',
  server: { port: 3000, host: true, proxy },
  preview: { port: 3000, proxy },
  // Vercel, Docker y nginx ya sirven esta carpeta.
  build: { outDir: 'build' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
    include: ['src/**/*.test.{js,jsx}'],
  },
}));
