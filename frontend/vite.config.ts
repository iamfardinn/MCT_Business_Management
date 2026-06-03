import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Strip `crossorigin` attribute Vite adds to <script>/<link> tags.
// Under Electron's file:// protocol, crossorigin makes the engine treat
// local assets as cross-origin requests which always fail.
const removeElectronCrossorigin = (): import('vite').Plugin => ({
  name: 'remove-electron-crossorigin',
  transformIndexHtml(html) {
    return html.replace(/ crossorigin(="[^"]*")?/g, '');
  },
});

export default defineConfig({
  plugins: [react(), removeElectronCrossorigin()],
  resolve: {
    alias: {
      '@mct/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
