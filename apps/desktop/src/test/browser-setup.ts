import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// The app's real stylesheet, which is the entire point of this project: a
// token has a computed value here and a Tailwind class is a real rule.
import '../renderer/app.css'

afterEach(() => {
  cleanup()
})
