import { defineConfig } from 'vitest/config'

/**
 * The contract is read by all three processes, so like the format it is tested
 * with nothing platform-specific in scope. These tests are about what a schema
 * accepts and what an error says, both of which are pure.
 */
export default defineConfig({
  test: {
    name: 'ipc',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
