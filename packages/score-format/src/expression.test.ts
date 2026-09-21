import { describe, expect, it } from 'vitest'

import type { Note } from './note'
import {
  dynamicScaleAt,
  pedalValueAt,
  PEDAL_CONTROLLERS,
  soundingNote,
  validateExpression,
  type Expression,
  type PedalEvent,
} from './expression'

function note(overrides: Partial<Note> = {}): Note {
  return { pitch: 60, start: 0, duration: 480, velocity: 80, ...overrides }
}

describe('the pedal', () => {
  it('keeps the controller numbers MIDI has always used', () => {
    expect(PEDAL_CONTROLLERS.sustain).toBe(64)
    expect(PEDAL_CONTROLLERS.sostenuto).toBe(66)
  })

  it('is one event pair across a bar line, not a flag on every note', () => {
    // Down at the start of bar 1, up at the end of bar 2: two events cover
    // everything in between, whatever is written there.
    const pedals: PedalEvent[] = [
      { tick: 0, pedal: 'sustain', value: 127 },
      { tick: 3840, pedal: 'sustain', value: 0 },
    ]

    expect(pedals).toHaveLength(2)
    for (const tick of [0, 1, 1920, 1921, 3839]) {
      expect(pedalValueAt(pedals, 'sustain', tick), `tick ${String(tick)}`).toBe(127)
    }
    expect(pedalValueAt(pedals, 'sustain', 3840)).toBe(0)
    expect(pedalValueAt(pedals, 'sustain', 5000)).toBe(0)
  })

  it('keeps a half-pedal rather than rounding it to a switch', () => {
    const pedals: PedalEvent[] = [{ tick: 0, pedal: 'sustain', value: 64 }]
    expect(pedalValueAt(pedals, 'sustain', 100)).toBe(64)
  })

  it('is up before anyone pressed it', () => {
    expect(pedalValueAt([], 'sustain', 1000)).toBe(0)
  })

  it('keeps the three pedals apart', () => {
    const pedals: PedalEvent[] = [{ tick: 0, pedal: 'sostenuto', value: 127 }]
    expect(pedalValueAt(pedals, 'sostenuto', 10)).toBe(127)
    expect(pedalValueAt(pedals, 'sustain', 10)).toBe(0)
  })
})

describe('dynamics', () => {
  it('leaves a score with none exactly as written', () => {
    expect(dynamicScaleAt([], 0)).toBe(1)
    expect(soundingNote(note({ velocity: 80 }), undefined).velocity).toBe(80)
  })

  it('scales the whole passage from the mark onwards', () => {
    const dynamics = [
      { tick: 0, level: 'p' as const },
      { tick: 1920, level: 'f' as const },
    ]
    expect(dynamicScaleAt(dynamics, 0)).toBeLessThan(1)
    expect(dynamicScaleAt(dynamics, 1919)).toBe(dynamicScaleAt(dynamics, 0))
    expect(dynamicScaleAt(dynamics, 1920)).toBeGreaterThan(1)
  })

  it('interpolates through a crescendo instead of stepping at the end', () => {
    const dynamics = [{ tick: 1920, level: 'f' as const, rampFrom: 'p' as const, rampStart: 0 }]
    const start = dynamicScaleAt(dynamics, 0)
    const middle = dynamicScaleAt(dynamics, 960)
    const end = dynamicScaleAt(dynamics, 1920)
    expect(middle).toBeGreaterThan(start)
    expect(end).toBeGreaterThan(middle)
  })

  it('multiplies written velocity rather than replacing it', () => {
    // The point of the criterion: an accent inside a crescendo stays above its
    // neighbours at every point on the ramp.
    const expression: Expression = {
      dynamics: [{ tick: 1920, level: 'f', rampFrom: 'p', rampStart: 0 }],
    }

    for (const tick of [0, 480, 960, 1440, 1900]) {
      const plain = soundingNote(note({ start: tick, velocity: 70 }), expression)
      const accented = soundingNote(note({ start: tick, velocity: 100 }), expression)
      expect(accented.velocity, `tick ${String(tick)}`).toBeGreaterThan(plain.velocity)
    }
  })

  it('keeps an articulated accent above its neighbours too', () => {
    const expression: Expression = { dynamics: [{ tick: 0, level: 'pp' }] }
    const plain = soundingNote(note(), expression)
    const accented = soundingNote(note(), expression, 'accent')
    expect(accented.velocity).toBeGreaterThan(plain.velocity)
  })

  it('never leaves a velocity outside what MIDI can carry', () => {
    const loud: Expression = { dynamics: [{ tick: 0, level: 'fff' }] }
    const quiet: Expression = { dynamics: [{ tick: 0, level: 'ppp' }] }
    expect(soundingNote(note({ velocity: 127 }), loud, 'marcato').velocity).toBe(127)
    expect(soundingNote(note({ velocity: 1 }), quiet).velocity).toBeGreaterThanOrEqual(1)
  })
})

describe('articulation', () => {
  it('shortens a staccato note without silencing it', () => {
    const played = soundingNote(note({ duration: 480 }), undefined, 'staccato')
    expect(played.duration).toBeLessThan(480)
    expect(played.duration).toBeGreaterThan(0)
  })

  it('leaves a tenuto note its full length', () => {
    expect(soundingNote(note({ duration: 480 }), undefined, 'tenuto').duration).toBe(480)
  })

  it('never produces a note of no length', () => {
    expect(soundingNote(note({ duration: 1 }), undefined, 'staccato').duration).toBeGreaterThan(0)
  })
})

describe('validateExpression', () => {
  it('says nothing about a score with no expression at all', () => {
    expect(validateExpression(undefined)).toEqual([])
  })

  it('refuses a pedal value outside 0 to 127', () => {
    expect(
      validateExpression({ pedals: [{ tick: 0, pedal: 'sustain', value: 200 }] }).join('\n'),
    ).toContain('0 to 127')
  })

  it('refuses a ramp with no start', () => {
    expect(
      validateExpression({ dynamics: [{ tick: 960, level: 'f', rampFrom: 'p' }] }).join('\n'),
    ).toContain('where the ramp starts')
  })

  it('refuses a ramp that starts after it ends', () => {
    expect(
      validateExpression({
        dynamics: [{ tick: 960, level: 'f', rampFrom: 'p', rampStart: 1920 }],
      }).join('\n'),
    ).toContain('not before it')
  })
})
