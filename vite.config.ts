import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
  },
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/pixi.js/')) return undefined;
          if (
            id.includes('/pixi.js/lib/advanced-blend-modes/') ||
            id.includes('/pixi.js/lib/compressed-textures/') ||
            id.includes('/pixi.js/lib/accessibility/')
          ) {
            return 'pixi-optional';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
