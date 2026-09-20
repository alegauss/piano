import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const appDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: fileURLToPath(new URL('./src/renderer/', import.meta.url)),
  // Relative, because the built renderer is opened with loadFile and not served.
  base: './',
  plugins: [react()],
  server: {
    port: 5273,
    strictPort: true,
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/renderer/', import.meta.url)),
    emptyOutDir: true,
    // Electron pins the Chromium version, so there is no older browser to support.
    target: 'chrome140',
    sourcemap: true,
  },
  cacheDir: `${appDir}node_modules/.vite`,
})
