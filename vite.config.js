import { defineConfig } from 'vite';

export default defineConfig({
  // CrazyGames serves the build from a nested path inside their CDN, so every
  // asset reference has to be relative.
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
