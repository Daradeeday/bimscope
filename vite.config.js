import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  assetsInclude: ['**/*.wasm'],
  resolve: {
    alias: {
      'three/examples/jsm/utils/BufferGeometryUtils': resolve(
        __dirname,
        'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'
      ),
    },
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
      },
    },
  },
  optimizeDeps: {
    include: ['three', 'three/examples/jsm/utils/BufferGeometryUtils'],
  },
});
