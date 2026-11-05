// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

/** @returns {import('vite').Plugin} */
function watchPublicAndSlides() {
  return {
    name: 'watch-public-and-slides',
    configureServer(server) {
      server.watcher.add(['public/**/*', 'src/content/slides/**/*']);
      const triggerReload = (file = '') => {
        if (file.includes('/public/') || file.includes('/src/content/slides/')) {
          server.ws.send({ type: 'full-reload', path: '*' });
        }
      };
      server.watcher.on('add', triggerReload);
      server.watcher.on('change', triggerReload);
      server.watcher.on('unlink', triggerReload);
    },
  };
}

export default defineConfig({
  build: { inlineStylesheets: 'always' },
  vite: {
    plugins: [tailwindcss(), watchPublicAndSlides()],
    build: { assetsInlineLimit: 1024 * 64 },
  },
});
