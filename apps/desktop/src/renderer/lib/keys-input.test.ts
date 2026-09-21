import { beforeEach, describe, expect, it } from 'vitest'

import { createKeysInput, KEYS_VELOCITY, MAX_OCTAVE, MIN_OCTAVE, pitchForKey } from './keys-input'
import type { MidiEvent } from './midi'

/**
 * Key events are synthesised exactly here, which is the point of this input:
 * everything the practice block does can be tested without hardware.
 */

function setup() {
  const input = createKeysInput()
  const heard: MidiEvent[] = []
  input.onEvent((event) => heard.push(event))
  const stop = input.attach(document)
  input.setPlaying(true)
  return { input, heard, stop }
}

function press(key: string, options: KeyboardEventInit = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }))
}

function release(key: string) {
  document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
}

describe('the mapping', () => {
  it('lays two rows out as a piano, black keys above their white ones', () => {
    // Bottom row from C3, the row above from the C above it.
    expect(pitchForKey('z', 0)).toBe(48)
    expect(pitchForKey('s', 0)).toBe(49)
    expect(pitchForKey('x', 0)).toBe(50)
    expect(pitchForKey('m', 0)).toBe(59)
    expect(pitchForKey('q', 0)).toBe(60)
    expect(pitchForKey('i', 0)).toBe(72)
  })

  it('covers two octaves, which is more than the octave and a half asked for', () => {
    const [low, high] = [pitchForKey('z', 0), pitchForKey('i', 0)]
    expect((high ?? 0) - (low ?? 0)).toBe(24)
  })

  it('knows a key that plays nothing', () => {
    expect(pitchForKey('l', 0)).toBeNull()
    expect(pitchForKey(' ', 0)).toBeNull()
  })

  it('shifts by octaves, and reaches the ends of the piano without passing them', () => {
    expect(pitchForKey('z', 1)).toBe(60)
    expect(pitchForKey('z', -2)).toBe(24)
    // Shifted as far up as it goes, the top of the mapping is the top key.
    expect(pitchForKey('i', MAX_OCTAVE)).toBe(108)
    // And below the bottom key there is no note to play.
    expect(pitchForKey('z', MIN_OCTAVE)).toBeNull()
  })
})

describe('playing from the typing keyboard', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('plays nothing until it is switched on, since the letters are shortcuts', () => {
    const input = createKeysInput()
    const heard: MidiEvent[] = []
    input.onEvent((event) => heard.push(event))
    input.attach(document)
    press('z')
    expect(heard).toEqual([])
  })

  it('strikes and releases, at one fixed force', () => {
    const { heard } = setup()
    press('z')
    release('z')
    expect(heard).toEqual([
      { kind: 'on', pitch: 48, velocity: KEYS_VELOCITY },
      { kind: 'off', pitch: 48 },
    ])
  })

  it('never turns a held key into a stream of note-ons', () => {
    const { heard } = setup()
    press('z')
    for (let again = 0; again < 20; again += 1) {
      press('z', { repeat: true })
      // Some browsers repeat without saying so, which the held keys answer.
      press('z')
    }
    release('z')
    expect(heard.filter((event) => event.kind === 'on')).toHaveLength(1)
  })

  it('plays a chord, as far as the keyboard allows', () => {
    const { heard } = setup()
    press('z')
    press('c')
    press('b')
    expect(heard.map((event) => (event.kind === 'on' ? event.pitch : 0))).toEqual([48, 52, 55])
  })

  it('leaves a shortcut with a modifier alone', () => {
    const { heard } = setup()
    press('z', { ctrlKey: true })
    press('z', { metaKey: true })
    expect(heard).toEqual([])
  })

  it('leaves what is being typed into a field alone', () => {
    const { heard } = setup()
    const field = document.createElement('input')
    document.body.append(field)
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true }))
    expect(heard).toEqual([])
  })

  it('releases what is held when it is switched off, rather than stranding a note', () => {
    const { input, heard } = setup()
    press('z')
    press('c')
    input.setPlaying(false)
    expect(heard.filter((event) => event.kind === 'off').map((event) => event.pitch)).toEqual([
      48, 52,
    ])
    expect(input.state.held).toEqual([])
  })

  it('releases what is held when the octave shifts, since the keys now mean other notes', () => {
    const { input, heard } = setup()
    press('z')
    input.shiftOctave(1)
    expect(heard.at(-1)).toEqual({ kind: 'off', pitch: 48 })

    press('z')
    expect(heard.at(-1)).toEqual({ kind: 'on', pitch: 60, velocity: KEYS_VELOCITY })
    expect(input.state.octave).toBe(1)
  })

  it('lets go of everything when the window loses focus', () => {
    const { input, heard } = setup()
    press('z')
    window.dispatchEvent(new Event('blur'))
    expect(heard.at(-1)).toEqual({ kind: 'off', pitch: 48 })
    expect(input.state.held).toEqual([])
  })

  it('says where the mapping sits and what is held', () => {
    const { input } = setup()
    expect(input.state.range).toEqual([48, 72])
    press('z')
    press('c')
    expect(input.state.held).toEqual([48, 52])
    input.shiftOctave(-1)
    expect(input.state.range).toEqual([36, 60])
  })

  it('stops listening when it is detached', () => {
    const { heard, stop } = setup()
    stop()
    press('z')
    expect(heard).toEqual([])
  })
})
