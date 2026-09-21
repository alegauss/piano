import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Renderer logic that is about what is said rather than where it lands.
 *
 * jsdom is enough for a class-merging helper, a theme store or a component's
 * text and roles. Anything asking about a measured size, a scroll position or
 * a focus order belongs in the browser project beside this one, because jsdom
 * would answer from nothing and the test would pass against a stylesheet that
 * never loaded.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'renderer',
    environment: 'jsdom',
    include: ['src/renderer/**/*.test.{ts,tsx}'],
    // `*.browser.test.tsx` also ends in `.test.tsx`, so without this the fast
    // project silently runs the browser suite in jsdom and fails on the first
    // thing jsdom does not implement. The split is the whole methodology.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.browser.test.*',
      '**/*-live.test.*',
      '**/*.premise.test.*',
    ],
    setupFiles: ['./src/test/setup.ts'],
  },
})
