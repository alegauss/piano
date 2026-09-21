import { describe, expect, it } from 'vitest'

import { describeMidi, parseMidi } from './midi'

describe('reading what a controller sent', () => {
  it('reads a note on', () => {
    expect(parseMidi([0x90, 60, 100])).toEqual({ kind: 'on', pitch: 60, velocity: 100 })
  })

  it('reads a note off', () => {
    expect(parseMidi([0x80, 60, 64])).toEqual({ kind: 'off', pitch: 60 })
  })

  it('treats a note on at velocity zero as a release, which half of them send', () => {
    expect(parseMidi([0x90, 60, 0])).toEqual({ kind: 'off', pitch: 60 })
  })

  it('hears every channel, since a controller may use any of them', () => {
    expect(parseMidi([0x9f, 48, 80])).toEqual({ kind: 'on', pitch: 48, velocity: 80 })
    expect(parseMidi([0x83, 48, 0])).toEqual({ kind: 'off', pitch: 48 })
  })

  it('turns the pedal controllers into pedals, at the range the engine takes', () => {
    expect(parseMidi([0xb0, 64, 127])).toEqual({ kind: 'pedal', pedal: 'sustain', value: 127 })
    expect(parseMidi([0xb0, 64, 0])).toEqual({ kind: 'pedal', pedal: 'sustain', value: 0 })
    expect(parseMidi([0xb0, 64, 60])).toEqual({ kind: 'pedal', pedal: 'sustain', value: 60 })
    expect(parseMidi([0xb0, 66, 100])).toEqual({ kind: 'pedal', pedal: 'sostenuto', value: 100 })
    expect(parseMidi([0xb0, 67, 40])).toEqual({ kind: 'pedal', pedal: 'softUnaCorda', value: 40 })
  })

  it('keeps anything else whole, for the monitor to show', () => {
    expect(parseMidi([0xb0, 1, 40])).toEqual({ kind: 'other', status: 0xb0, data: [0xb0, 1, 40] })
    expect(parseMidi([0xe0, 0, 64])).toEqual({ kind: 'other', status: 0xe0, data: [0xe0, 0, 64] })
  })

  it('refuses a fragment rather than inventing a note from it', () => {
    expect(parseMidi([0x90])).toBeNull()
    expect(parseMidi([])).toBeNull()
  })

  it('says what happened, in words', () => {
    expect(describeMidi({ kind: 'on', pitch: 60, velocity: 90 })).toBe('note on 60 velocity 90')
    expect(describeMidi({ kind: 'off', pitch: 60 })).toBe('note off 60')
    expect(describeMidi({ kind: 'pedal', pedal: 'sustain', value: 127 })).toBe('sustain pedal 127')
    expect(describeMidi({ kind: 'other', status: 0xe0, data: [0xe0, 0, 64] })).toBe('e0 00 40')
  })
})
