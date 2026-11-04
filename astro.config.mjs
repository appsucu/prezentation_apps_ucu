// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // Відносні шляхи й вбудовані CSS/JS: dist/ працює з будь-якої папки на хостингу.
  build: { inlineStylesheets: 'always' },
  vite: { build: { assetsInlineLimit: 1024 * 64 } },
});
