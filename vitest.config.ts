import { defineConfig } from 'vitest/config'

/**
 * The projects split on one question: does this test start something?
 *
 * A test that spawns an Electron process or a browser costs seconds where the
 * rest cost milliseconds. Paying for both on every run is how a suite stops
 * being run at all, so they are separate and named for what they cost:
 *
 *   npm test           the fast ones -- no process, no display, no bundle
 *   npm run test:live  everything that starts something, which needs a build
 *   npm run test:all   both, which is what CI runs
 *
 * The fast half runs in node for the packages, which must stay platform-free,
 * and in jsdom for renderer logic that is about what is said rather than where
 * it lands. The browser half exists because jsdom lays nothing out: a test
 * about a measured height or a focus order there asserts a number the test
 * itself invented, and would pass against a stylesheet that never loaded.
 */
export default defineConfig({
  test: {
    projects: [
      'packages/score-format/vitest.config.ts',
      'packages/ipc/vitest.config.ts',
      'packages/library/vitest.config.ts',
      'packages/sample-pack/vitest.config.ts',
      'apps/mcp-server/vitest.config.ts',
      'apps/desktop/vitest.config.ts',
      'apps/desktop/vitest.main.config.ts',
      'apps/desktop/vitest.browser.config.ts',
      'apps/desktop/vitest.live.config.ts',
      'apps/desktop/vitest.premise.config.ts',
      'vitest.scripts.config.ts',
    ],
  },
})
