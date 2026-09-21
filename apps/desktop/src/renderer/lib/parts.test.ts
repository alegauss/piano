import type { Hand, Note } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import {
  noteHeard,
  noteVisible,
  NOTHING_TOUCHED,
  playbackFilter,
  toggleHidden,
  toggleHiddenHand,
  toggleMuted,
  toggleMutedHand,
  toggleSoloed,
  visibleNotes,
} from './parts'

function note(part: string, hand?: Hand): Note {
  return { pitch: 60, start: 0, duration: 240, velocity: 80, part, hand }
}

const melody = note('right', 'right')
const bass = note('left', 'left')
const unassigned: Note = { pitch: 72, start: 0, duration: 240, velocity: 80 }

describe('hearing and watching are separate questions', () => {
  it('silences a part without taking it off the roll', () => {
    const view = toggleMuted(NOTHING_TOUCHED, 'left')
    expect(noteHeard(bass, view)).toBe(false)
    expect(noteVisible(bass, view)).toBe(true)
  })

  it('takes a part off the roll without silencing it', () => {
    const view = toggleHidden(NOTHING_TOUCHED, 'left')
    expect(noteVisible(bass, view)).toBe(false)
    expect(noteHeard(bass, view)).toBe(true)
  })

  it('does the same for a hand, which is a property of the note', () => {
    const heardOnly = toggleHiddenHand(NOTHING_TOUCHED, 'left')
    expect(noteVisible(bass, heardOnly)).toBe(false)
    expect(noteHeard(bass, heardOnly)).toBe(true)

    const watchedOnly = toggleMutedHand(NOTHING_TOUCHED, 'left')
    expect(noteHeard(bass, watchedOnly)).toBe(false)
    expect(noteVisible(bass, watchedOnly)).toBe(true)
  })

  it('leaves a note with no hand out of an argument about hands', () => {
    const view = toggleMutedHand(NOTHING_TOUCHED, 'left')
    expect(noteHeard(unassigned, view)).toBe(true)
    expect(noteVisible(unassigned, toggleHiddenHand(NOTHING_TOUCHED, 'left'))).toBe(true)
  })

  it('draws what is left, and only that', () => {
    const view = toggleHidden(NOTHING_TOUCHED, 'right')
    expect(visibleNotes([melody, bass, unassigned], view)).toEqual([bass, unassigned])
  })
})

describe('solo', () => {
  it('is alone by default', () => {
    const view = toggleSoloed(NOTHING_TOUCHED, 'right')
    expect(noteHeard(melody, view)).toBe(true)
    expect(noteHeard(bass, view)).toBe(false)
  })

  it('adds with a modifier, as every audio tool does', () => {
    const one = toggleSoloed(NOTHING_TOUCHED, 'right')
    const both = toggleSoloed(one, 'left', true)
    expect(noteHeard(melody, both)).toBe(true)
    expect(noteHeard(bass, both)).toBe(true)
  })

  it('wins over a mute, and turns off when the only soloed part is soloed again', () => {
    const muted = toggleMuted(NOTHING_TOUCHED, 'right')
    const soloed = toggleSoloed(muted, 'right')
    expect(noteHeard(melody, soloed)).toBe(true)

    const off = toggleSoloed(soloed, 'right')
    expect(off.soloed).toEqual([])
    expect(noteHeard(melody, off)).toBe(false)
  })

  it('replaces the soloed part when another is soloed without the modifier', () => {
    const view = toggleSoloed(toggleSoloed(NOTHING_TOUCHED, 'right'), 'left')
    expect(view.soloed).toEqual(['left'])
  })
})

describe('what the transport is told', () => {
  it('says nothing about hands when every hand is heard', () => {
    expect(playbackFilter(NOTHING_TOUCHED).hands).toEqual([])
  })

  it('names the hands still heard when one is silenced', () => {
    expect(playbackFilter(toggleMutedHand(NOTHING_TOUCHED, 'left')).hands).toEqual(['right'])
  })

  it('never mentions hiding, which is not the transport’s business', () => {
    const filter = playbackFilter(toggleHidden(NOTHING_TOUCHED, 'left'))
    expect(filter.mutedParts).toEqual([])
    expect(filter.soloParts).toEqual([])
  })
})
