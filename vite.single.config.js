/**
 * Build for the standalone single-file HTML.
 *
 * Everything ends up in one classic script: Chrome refuses to run ES modules
 * from a file:// page, so the usual module build cannot simply be inlined.
 */
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist-single',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'game.js',
      },
    },
  },
});
