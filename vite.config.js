import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // relative paths so the built app works inside Electron (file://) too
  server: {
    port: 5173,
    proxy: {
      // In dev, forward API calls to the Express server
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
  },
});
