import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: 'src-modern',          // Frontend source folder
  publicDir: '../public-assets', 
  base: './',
  build: {
    outDir: '../dist-modern',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/index.html'),
        analytics: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/compose.html'),
        calendar: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/calendar.html'),
        elements: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/elements.html'),
        'elements-alerts': resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/elements-alerts.html'),
        'elements-badges': resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/elements-badges.html'),
        'elements-buttons': resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/elements-buttons.html'),
        'elements-cards': resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/elements-cards.html'),
        'elements-forms': resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/elements-forms.html'),
        'elements-modals': resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/elements-modals.html'),
        'elements-tables': resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/elements-tables.html'),
        files: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/files.html'),
        forms: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/forms.html'),
        help: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/help.html'),
        messages: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/messages.html'),
        orders: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/orders.html'),
        products: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/products.html'),
        reports: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/reports.html'),
        security: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/security.html'),
        settings: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/settings.html'),
        users: resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern/users.html')
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(fileURLToPath(new URL('.', import.meta.url)), 'src-modern'),
      '~bootstrap': resolve(fileURLToPath(new URL('.', import.meta.url)), 'node_modules/bootstrap'),
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin', 'color-functions']
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Forward /login and /api calls to backend running on port 5000
      '/login': 'http://localhost:5000',
      '/api': 'http://localhost:5000'
    }
  }
});
