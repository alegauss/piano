import type { OpenResult } from '@piano/ipc'
import { describe, expect, it } from 'vitest'

import { outcomeOf, plainly } from './open'

/**
 * What the window makes of main's answer. The score crosses the bridge as a
 * plain clone, so the claim is that a valid one comes back typed and anything
 * else is a refusal, never a half-read score.
 */

const valid = {
  formatVersion: 1,
  metadata: { title: 'Aria' },
  notes: [{ pitch: 67, start: 0, duration: 480, velocity: 70 }],
}

describe('reading an answer to an open', () => {
  it('turns an opened score into one the window can play', () => {
    const outcome = outcomeOf({ kind: 'opened', name: 'aria.json', score: valid, notices: [] })
    expect(outcome.kind).toBe('opened')
    if (outcome.kind === 'opened') {
      expect(outcome.score.metadata.title).toBe('Aria')
    }
  })

  it('refuses what calls itself opened and is not a score, rather than trusting the label', () => {
    const outcome = outcomeOf({
      kind: 'opened',
      name: 'odd.json',
      score: { nope: true },
      notices: [],
    })
    expect(outcome.kind).toBe('refused')
  })

  it('passes a refusal and a closed dialog through as they are', () => {
    const refused: OpenResult = { kind: 'refused', name: 'x.json', message: 'no', problems: [] }
    expect(outcomeOf(refused)).toEqual(refused)
    expect(outcomeOf({ kind: 'none' })).toEqual({ kind: 'none' })
  })
})

describe('a problem as a person reads it', () => {
  it('leads with what the file needs and how to fix it, and keeps the path aside', () => {
    expect(
      plainly({
        kind: 'out of range',
        path: 'notes.3.pitch',
        received: '200',
        expected: 'a MIDI pitch from 0 to 127',
        fix: 'use 20, the pitch an octave lower… or check the octave',
      }),
    ).toEqual({
      needs: 'a MIDI pitch from 0 to 127',
      fix: 'use 20, the pitch an octave lower… or check the octave',
      where: 'notes.3.pitch',
      found: '200',
    })
  })
})
