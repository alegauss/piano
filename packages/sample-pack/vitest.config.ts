import { defineConfig } from 'vitest/config'

/**
 * The pack's rules, tested without a download: parsing the library's map,
 * choosing what to keep, trimming and normalising sound, and what makes a
 * manifest complete. The pipeline that fetches and encodes is exercised by
 * running it, which needs the network and ffmpeg and is not a unit test.
 */
export default defineConfig({
  test: {
    name: 'sample-pack',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
