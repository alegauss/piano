import type { Note } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import {
  CHORD_TICKS,
  extras,
  nextExpectation,
  outstanding,
  playerNotes,
  resumeTick,
  satisfied,
} from './practice'

function note(pitch: number, start: number, part?: string): Note {
  return { pitch, start, duration: 240, velocity: 80, part }
}

describe('what the player owes next', () => {
  const melody = [note(60, 0), note(62, 480), note(64, 960)]

  it('is the next note from where playback stands', () => {
    expect(nextExpectation(melody, 0)?.pitches).toEqual([60])
    expect(nextExpectation(melody, 1)?.pitches).toEqual([62])
    expect(nextExpectation(melody, 480)?.pitches).toEqual([62])
  })

  it('is nothing once the piece is over', () => {
    expect(nextExpectation(melody, 2000)).toBeNull()
  })

  it('groups a chord, so its notes are owed together', () => {
    const chord = [note(60, 480), note(64, 480), note(67, 480 + CHORD_TICKS - 1)]
    const found = nextExpectation(chord, 0)
    expect(found?.tick).toBe(480)
    expect(found?.pitches).toEqual([60, 64, 67])
  })

  it('does not swallow the note after a chord into it', () => {
    const run = [note(60, 480), note(64, 480), note(67, 480 + CHORD_TICKS + 100)]
    expect(nextExpectation(run, 0)?.pitches).toEqual([60, 64])
  })
})

describe('whose notes they are', () => {
  const both = [note(72, 0, 'right'), note(36, 0, 'left'), note(74, 480, 'right')]

  it('is whatever the app has been told not to play, since somebody is playing it', () => {
    const silenced = playerNotes(both, { mutedParts: ['right'] })
    expect(silenced.map((found) => found.pitch)).toEqual([72, 74])
  })

  it('is the whole piece when nothing is silenced, which is playing along', () => {
    expect(playerNotes(both, {})).toHaveLength(3)
  })

  it('follows a solo as well as a mute', () => {
    const silenced = playerNotes(both, { soloParts: ['left'] })
    expect(silenced.map((found) => found.pitch)).toEqual([72, 74])
  })
})

describe('whether it has been played', () => {
  const chord = { tick: 480, pitches: [60, 64, 67] }

  it('needs every note of the group', () => {
    expect(satisfied(chord, new Set([60, 64]))).toBe(false)
    expect(satisfied(chord, new Set([60, 64, 67]))).toBe(true)
  })

  it('says which notes are still outstanding, for the keys to light', () => {
    expect(outstanding(chord, new Set([64]))).toEqual([60, 67])
  })

  it('is not blocked by a note nobody asked for', () => {
    const struck = new Set([60, 64, 67, 61])
    expect(satisfied(chord, struck)).toBe(true)
    expect(extras(chord, struck)).toEqual([61])
  })

  it('notes the extras without holding them against anyone', () => {
    expect(extras(chord, new Set([61, 62]))).toEqual([61, 62])
    expect(satisfied(chord, new Set([61, 62]))).toBe(false)
  })
})

describe('where playback carries on from', () => {
  const chord = { tick: 480, pitches: [60, 64] }

  it('resumes on the tick when there is an accompaniment to sound there', () => {
    expect(resumeTick(chord, true)).toBe(480)
  })

  it('resumes past it when the player owes everything, so nothing is replayed', () => {
    expect(resumeTick(chord, false)).toBe(481)
  })
})
