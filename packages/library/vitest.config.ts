import { defineConfig } from 'vitest/config'

/**
 * The library against a filesystem the test holds, and against a real one
 * where the claim is about what lands on disk.
 */
export default defineConfig({
  test: {
    name: 'library',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
