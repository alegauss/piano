import { defineConfig } from 'vitest/config'

/**
 * The format runs in main, in the renderer and in the MCP server, so its tests
 * run in node with nothing platform-specific available. A test here that needs
 * a DOM is a sign the format has grown a dependency it should not have.
 */
export default defineConfig({
  test: {
    name: 'score-format',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
