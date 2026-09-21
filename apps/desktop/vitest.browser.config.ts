import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

/**
 * The half of the renderer that needs a layout.
 *
 * This project exists because of a real class of defect in this app: half the
 * interface is DOM and half is a canvas, and the two agree only if the same
 * custom properties resolve the same way in both. jsdom resolves no custom
 * property, lays nothing out and has no canvas, so every claim of that kind
 * would be asserted against numbers the test invented.
 *
 * Files named *.browser.test.tsx run in headless Chromium through Playwright,
 * with the app's real stylesheet loaded, so a Tailwind class is a real rule, a
 * token has a computed value and a height is measured rather than declared.
 *
 * Beside jsdom, not instead of it: this starts a browser, which is the line
 * `npm test` does not cross.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The score format brings zod in, and the sheet view brings VexFlow through
  // a lazy import, so neither is found by the scan. Discovered mid-run, either
  // makes Vite reload the page under a test that is already running, which is
  // a flaky failure on every clean checkout, CI included.
  optimizeDeps: { include: ['zod', 'vexflow/bravura'] },
  test: {
    name: 'renderer-browser',
    include: ['src/renderer/**/*.browser.test.{ts,tsx}'],
    setupFiles: ['./src/test/browser-setup.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
})
