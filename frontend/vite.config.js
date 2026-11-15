import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:8000' } },
  },
  preview: {
    proxy: { '/api': { target: 'http://127.0.0.1:8000' } },
  },
  build: {
    cssCodeSplit: false,
    rolldownOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app.html', import.meta.url)),
        project: fileURLToPath(new URL('./project.html', import.meta.url)),
      },
    },
  },
});
