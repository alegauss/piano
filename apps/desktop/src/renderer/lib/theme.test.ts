import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getTheme, restoreTheme, setTheme } from './theme'

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme')
  localStorage.clear()
})

describe('the theme store', () => {
  it('defaults to dark, which is how the app is meant to be used', () => {
    expect(getTheme()).toBe('dark')
    expect(restoreTheme()).toBe('dark')
  })

  it('remembers the choice across a restart', () => {
    setTheme('light')
    document.documentElement.removeAttribute('data-theme')
    expect(restoreTheme()).toBe('light')
    expect(getTheme()).toBe('light')
  })

  it('treats a nonsense stored value as dark rather than as itself', () => {
    localStorage.setItem('piano.theme', 'neon')
    expect(restoreTheme()).toBe('dark')
  })

  it('still applies the theme when storage throws', () => {
    // Private windows and cleared site data both throw here. A theme that does
    // not persist is a small loss; a renderer that fails to start is not.
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage is unavailable')
    })
    expect(() => {
      setTheme('light')
    }).not.toThrow()
    expect(document.documentElement.dataset['theme']).toBe('light')
    setItem.mockRestore()
  })

  it('starts on dark when reading storage throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage is unavailable')
    })
    expect(restoreTheme()).toBe('dark')
    getItem.mockRestore()
  })
})
