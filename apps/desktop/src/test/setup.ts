import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// A component left mounted between tests is how one test's state becomes
// another test's mystery.
afterEach(() => {
  cleanup()
})
