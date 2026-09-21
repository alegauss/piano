import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * jsdom lays nothing out, so it has no ResizeObserver, and the controls
 * built on Radix ask for one as they mount. A stub that never reports is the
 * truthful answer here: nothing in jsdom ever resizes. Anything that cares
 * what a size actually is belongs in the browser project, where there is
 * a real one.
 */
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver

// A component left mounted between tests is how one test's state becomes
// another test's mystery.
afterEach(() => {
  cleanup()
})
