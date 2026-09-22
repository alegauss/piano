import { describe, expect, it } from 'vitest'

import { describeFiling } from './library'

describe('what the window says after filing a piece', () => {
  it('names the title and the id it went in under', () => {
    expect(describeFiling({ kind: 'filed', id: 'aria-in-c', title: 'Aria in C' })).toBe(
      'Added Aria in C to the library, as aria-in-c.',
    )
  })

  it('passes the reason on when it was refused', () => {
    expect(describeFiling({ kind: 'refused', message: 'the disk is full' })).toBe(
      'Could not add it to the library: the disk is full',
    )
  })
})
