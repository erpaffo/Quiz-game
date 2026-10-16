import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { BRAND, brandLogoHtml } from './shared/brand';

const root = resolve(import.meta.dirname, 'client');

/** Sostituisce %BRAND% e %BRAND_LOGO% nelle pagine con il nome del gioco (shared/brand.json). */
const brandPlugin = () => ({
  name: 'brand',
  transformIndexHtml: (html: string) => html.replaceAll('%BRAND_LOGO%', brandLogoHtml()).replaceAll('%BRAND%', BRAND.name)
});

export default defineConfig({
  plugins: [brandPlugin()],
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
