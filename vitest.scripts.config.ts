import { defineConfig } from 'vitest/config'

/**
 * The repository's own scripts, where one has something to decide.
 *
 * Most of them do not: they read a file and compare it to another, and the
 * comparison is the test. The association check is different — it reads what
 * three systems print about an installed app, and getting that wrong means a
 * release that says the piano is registered when it is not. The reading half
 * is text in and findings out, so it is tested here; the half that installs,
 * mounts and extracts can only run on the system it is for, and does, in CI.
 */
export default defineConfig({
  test: {
    name: 'scripts',
    environment: 'node',
    include: ['scripts/**/*.test.mjs'],
  },
})
