import { describe, expect, it } from 'vitest'

import { cn } from './cn'

describe('cn', () => {
  it('drops falsy values so a conditional class is one expression', () => {
    const isActive = false
    expect(cn('a', isActive && 'b', undefined, null, 'c')).toBe('a c')
  })

  it('lets a caller override a utility the component already set', () => {
    // The whole reason tailwind-merge is here: a transport button passing
    // px-2 to a component that sets px-4 must get px-2, not both.
    expect(cn('px-4 py-2', 'px-2')).toBe('py-2 px-2')
  })

  it('keeps utilities that do not conflict', () => {
    expect(cn('text-sm font-medium', 'tracking-tight')).toBe('text-sm font-medium tracking-tight')
  })
})
