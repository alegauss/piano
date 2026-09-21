import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

import { premiseRun } from './src/test/premise'

/**
 * The one test that proves the premise: a request becomes a score, the score
 * validates and is kept, the window opens it and plays it, and the opening
 * bars sound as written.
 *
 * Its own project because it is two worlds at once. The chain runs in Node —
 * the plugin's server over stdio, the built app with its window — through a
 * browser command, and the listening runs in Chromium, which has Web Audio.
 * Like the live suite it needs a build and refuses a stale one, since a chain
 * run against an old bundle proves nothing about the tree.
 */
export default defineConfig({
  optimizeDeps: { include: ['zod'] },
  test: {
    name: 'premise',
    include: ['src/**/*.premise.test.ts'],
    globalSetup: ['./src/test/built-setup.ts'],
    // Electron starts, the server starts, a piece is opened and rendered.
    testTimeout: 180_000,
    hookTimeout: 180_000,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
      commands: { premiseRun },
    },
  },
})
