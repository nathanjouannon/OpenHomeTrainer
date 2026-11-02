import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // localhost is a secure context: Web Bluetooth works without HTTPS.
    host: 'localhost',
    port: 5173,
  },
  build: {
    // The 3D chunk (Three.js) is lazy-loaded; the initial bundle stays small.
    chunkSizeWarningLimit: 1200,
  },
  preview: {
    host: 'localhost',
    port: 4173,
  },
});
