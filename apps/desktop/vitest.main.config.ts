import { defineConfig } from 'vitest/config'

/**
 * Main-process logic that does not need Electron to be asked about.
 *
 * The link host listens on loopback and writes a file, and the relay matches
 * answers to questions: both are plain Node, and both are exactly the kind of
 * code that is wrong in a way nobody sees until a tool call silently goes
 * nowhere. What does need Electron stays in the live project beside this one.
 */
export default defineConfig({
  test: {
    name: 'desktop-main',
    environment: 'node',
    include: ['src/main/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*-live.test.*'],
  },
})
