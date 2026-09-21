import { beforeEach, describe, expect, it } from 'vitest'

import { getTheme, restoreTheme, setTheme } from './theme'

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

describe('the theme', () => {
  it('defaults to dark, which is how the app is meant to be used', () => {
    expect(getTheme()).toBe('dark')
    expect(restoreTheme('')).toBe('dark')
  })

  it('opens in the theme main read from the settings, before anything else arrives', () => {
    expect(restoreTheme('?theme=light')).toBe('light')
    expect(getTheme()).toBe('light')
  })

  it('treats a nonsense theme in the address as dark rather than as itself', () => {
    expect(restoreTheme('?theme=neon')).toBe('dark')
  })

  it('shows a theme when asked', () => {
    setTheme('light')
    expect(document.documentElement.dataset['theme']).toBe('light')
  })
})
