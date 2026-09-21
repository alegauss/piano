import { defineConfig } from 'vitest/config'

/**
 * The tools are answers to sentences, and every one of them is pure: a tool
 * table over a library that is handed its filesystem and a link that is handed
 * its window. Nothing here starts a process or touches a disk, which is what
 * keeps the surface Claude Code reads testable at all.
 */
export default defineConfig({
  test: {
    name: 'mcp-server',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
