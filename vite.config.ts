import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vitest/config';

import { motionManifestPlugin } from './vite-plugin-motion-manifest.ts';
import { motionUploadPlugin } from './vite-plugin-motion-upload.ts';

export default defineConfig({
  plugins: [react(), basicSsl({ name: 'nelda-lan' }), motionManifestPlugin(), motionUploadPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    https: {},
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
