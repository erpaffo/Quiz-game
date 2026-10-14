import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, 'client');

export default defineConfig({
  root,
  // Bandiere e altre immagini statiche delle domande (servite da /flags/...).
  publicDir: resolve(root, 'public'),
  server: {
    fs: { allow: [import.meta.dirname] }
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        host: resolve(root, 'host.html'),
        controller: resolve(root, 'controller.html'),
        editor: resolve(root, 'editor.html')
      }
    }
  }
});
