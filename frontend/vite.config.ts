import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    // dev: proxy API/R2 ไปที่ wrangler dev
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/images': 'http://127.0.0.1:8787',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
