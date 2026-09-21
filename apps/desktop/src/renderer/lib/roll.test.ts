import { resolveTiming, type Note } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { keyRect } from './keyboard-geometry'
import {
  clampLead,
  DEFAULT_LEAD_SECONDS,
  MAX_LEAD_SECONDS,
  noteBox,
  partColours,
  soundingPitches,
  visibleNotes,
  visibleTicks,
  type RollView,
} from './roll'

/** 120bpm, 480 ticks a quarter: a quarter note is half a second and 480 ticks. */
const timing = resolveTiming(undefined)
const QUARTER = timing.ticksPerQuarter

function view(over: Partial<RollView> = {}): RollView {
  return {
    timing,
    position: 0,
    leadSeconds: DEFAULT_LEAD_SECONDS,
    tempoScale: 1,
    width: 1040,
    height: 600,
    ...over,
  }
}

function note(pitch: number, start: number, duration = QUARTER): Note {
  return { pitch, start, duration, velocity: 80 }
}

describe('the visible window', () => {
  it('spans the lead in seconds, converted through the tempo map', () => {
    // Three seconds at 120bpm is six quarters.
    expect(visibleTicks(view())).toEqual({ from: 0, to: 6 * QUARTER })
  })

  it('moves with the position', () => {
    expect(visibleTicks(view({ position: 2 * QUARTER }))).toEqual({
      from: 2 * QUARTER,
      to: 8 * QUARTER,
    })
  })

  it('shows less music at a slower practice tempo, so the notes fall at the same rate', () => {
    expect(visibleTicks(view({ tempoScale: 0.5 })).to).toBe(3 * QUARTER)
    expect(visibleTicks(view({ tempoScale: 2 })).to).toBe(12 * QUARTER)
  })

  it('follows a tempo change: half the speed, half the music in the same seconds', () => {
    const slowing = resolveTiming({
      ticksPerQuarter: 480,
      tempo: [
        { tick: 0, microsecondsPerQuarter: 500_000 },
        { tick: 2 * 480, microsecondsPerQuarter: 1_000_000 },
      ],
    })
    // Two quarters at half a second, then two seconds left at one second each.
    expect(visibleTicks(view({ timing: slowing })).to).toBe(4 * 480)
  })

  it('keeps the lead inside what a roll can show', () => {
    expect(clampLead(0.1)).toBeGreaterThan(0)
    expect(clampLead(60)).toBe(MAX_LEAD_SECONDS)
    expect(clampLead(DEFAULT_LEAD_SECONDS)).toBe(DEFAULT_LEAD_SECONDS)
  })
})

describe('a note on the field', () => {
  it('sits in its key’s column, at the width keyRect gives', () => {
    for (const pitch of [21, 60, 61, 66, 108]) {
      const box = noteBox(note(pitch, 0), view())
      expect(box?.x).toBe(keyRect(pitch, 1040)?.x)
      expect(box?.width).toBe(keyRect(pitch, 1040)?.width)
    }
  })

  it('reaches the strike line exactly when it sounds', () => {
    const box = noteBox(note(60, 2 * QUARTER), view({ position: 2 * QUARTER }))
    expect(box?.y ?? 0).toBeLessThan(600)
    // Its head is on the line: the note's foot is the bottom of the box.
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(600, 6)
  })

  it('stands a lead away at the top of the field, and halfway at half the lead', () => {
    const top = noteBox(note(60, 6 * QUARTER), view())
    expect((top?.y ?? 0) + (top?.height ?? 0)).toBeCloseTo(0, 6)
    const middle = noteBox(note(60, 3 * QUARTER), view())
    expect((middle?.y ?? 0) + (middle?.height ?? 0)).toBeCloseTo(300, 6)
  })

  it('is as long as it lasts', () => {
    const box = noteBox(note(60, 0, 3 * QUARTER), view())
    // Three quarters is a second and a half: half the three-second field.
    expect(box?.height).toBeCloseTo(300, 6)
  })

  it('hangs below the line while it is sounding, rather than vanishing at its strike', () => {
    const box = noteBox(note(60, 0, 2 * QUARTER), view({ position: QUARTER }))
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(600)
    expect(box?.y ?? 0).toBeLessThan(600)
  })

  it('is off the field before it is due and once it is over', () => {
    expect(noteBox(note(60, 7 * QUARTER), view())).toBeNull()
    expect(noteBox(note(60, 0, QUARTER), view({ position: 2 * QUARTER }))).toBeNull()
    expect(noteBox(note(11, 0), view())).toBeNull()
  })

  it('stays visible however short it is', () => {
    expect(noteBox(note(60, 0, 1), view())?.height).toBeGreaterThanOrEqual(3)
  })
})

describe('what the roll asks for', () => {
  const notes = [note(60, 0), note(62, 4 * QUARTER), note(64, 20 * QUARTER)]

  it('takes the notes inside the window and leaves the rest', () => {
    expect(visibleNotes(notes, view()).map((n) => n.pitch)).toEqual([60, 62])
  })

  it('names the pitches sounding at a tick, and none at their release', () => {
    expect(soundingPitches(notes, 0)).toEqual([60])
    expect(soundingPitches(notes, QUARTER - 1)).toEqual([60])
    expect(soundingPitches(notes, QUARTER)).toEqual([])
    expect(soundingPitches([note(60, 0), note(64, 0)], 10)).toEqual([60, 64])
  })

  it('gives each part its own colour, in the order the parts appear', () => {
    const colours = partColours([
      { ...note(60, 0), part: 'left' },
      { ...note(72, 0), part: 'right' },
      { ...note(74, QUARTER), part: 'right' },
    ])
    expect(colours.get('left')).toBe('--note-part-1')
    expect(colours.get('right')).toBe('--note-part-2')
  })
})
