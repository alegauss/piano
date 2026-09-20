import { defineConfig } from 'vitest/config'

/**
 * The tests that start a real Electron process.
 *
 * Whether the renderer can reach `require`, whether a malformed IPC payload is
 * refused, whether the window opens at all: none of these has an answer
 * outside a running app, because each depends on the sandbox, on
 * contextIsolation and on what the preload exposed. They cost seconds and they
 * need a build on disk, which is why they are a gate rather than part of the
 * suite somebody runs between edits.
 *
 * The global setup refuses a stale build. A live test run against a bundle
 * older than the tree answers green about code nobody is looking at, which is
 * worse than not running it.
 */
export default defineConfig({
  test: {
    name: 'desktop-live',
    environment: 'node',
    include: ['src/**/*-live.test.ts'],
    globalSetup: ['./src/test/built-setup.ts'],
    // Electron takes a few seconds to start, load and answer.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
