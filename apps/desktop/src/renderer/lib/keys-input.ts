import type { MidiEvent } from './midi'

/**
 * The computer keyboard as a piano.
 *
 * Most people open this app on a machine with no controller attached, and if
 * the answer is "buy one first" then nobody tries it. So two rows of the
 * typing keyboard are a real input, in the layout trackers and sequencers
 * have used for decades: the bottom row is an octave from Z, the top row the
 * octave above from Q, and the black keys sit above their white ones exactly
 * where they do on a piano.
 *
 * Its limits are stated rather than hidden. There is no velocity on a
 * typewriter, so every note is struck at one fixed value and nothing grades
 * dynamics from this input. Key rollover means a typical keyboard silently
 * drops some chords, which belongs in the interface rather than leaving
 * somebody to conclude their playing is at fault.
 *
 * It is also what makes the practice block testable: key events can be
 * synthesised exactly, where testing MIDI input needs hardware no CI has.
 */

/** Semitones above the row's base note, by key. */
const LOWER_ROW: Readonly<Record<string, number>> = {
  z: 0,
  s: 1,
  x: 2,
  d: 3,
  c: 4,
  v: 5,
  g: 6,
  b: 7,
  h: 8,
  n: 9,
  j: 10,
  m: 11,
  ',': 12,
}

const UPPER_ROW: Readonly<Record<string, number>> = {
  q: 12,
  '2': 13,
  w: 14,
  '3': 15,
  e: 16,
  r: 17,
  '5': 18,
  t: 19,
  '6': 20,
  y: 21,
  '7': 22,
  u: 23,
  i: 24,
}

export const KEY_SEMITONES: Readonly<Record<string, number>> = { ...LOWER_ROW, ...UPPER_ROW }

/** What the bottom row plays at octave zero: C3, low enough for a left hand. */
const BASE_PITCH = 48

/** How far the mapping can be shifted either way, in octaves. */
export const MIN_OCTAVE = -3
export const MAX_OCTAVE = 3

/** Every note struck at the same force, because a typewriter has none. */
export const KEYS_VELOCITY = 80

export type KeysState = {
  /** Whether typing plays. Off by default: the letters are shortcuts until somebody says otherwise. */
  readonly playing: boolean
  /** Octaves above or below the resting mapping. */
  readonly octave: number
  /** The lowest and highest pitch the mapping reaches now. */
  readonly range: readonly [number, number]
  /** Which pitches are held down, for anything that draws them. */
  readonly held: readonly number[]
}

export type KeysInput = {
  readonly state: KeysState
  readonly subscribe: (listener: () => void) => () => void
  readonly setPlaying: (playing: boolean) => void
  readonly shiftOctave: (by: number) => void
  readonly onEvent: (listener: (event: MidiEvent) => void) => () => void
  /** Listen on a target, usually the document. Returns the way to stop. */
  readonly attach: (target?: EventTarget) => () => void
}

/** The pitch a key plays at an octave shift, or null if the key is not mapped. */
export function pitchForKey(key: string, octave: number): number | null {
  const semitones = KEY_SEMITONES[key.toLowerCase()]
  if (semitones === undefined) {
    return null
  }
  const pitch = BASE_PITCH + semitones + octave * 12
  return pitch >= 21 && pitch <= 108 ? pitch : null
}

/** A keystroke meant for a field is not a note. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

export function createKeysInput(): KeysInput {
  let playing = false
  let octave = 0
  /** The pitch each held key is sounding, so a release lands on the right note. */
  const down = new Map<string, number>()
  const listeners = new Set<() => void>()
  const events = new Set<(event: MidiEvent) => void>()

  /**
   * The snapshot is stored rather than built on demand.
   *
   * A getter returning a fresh object every call spins useSyncExternalStore
   * for ever: it compares snapshots with Object.is, and two identical objects
   * are never the same one.
   */
  let state: KeysState = { playing: false, octave: 0, range: [0, 0], held: [] }

  const changed = () => {
    state = {
      playing,
      octave,
      range: range(),
      held: [...down.values()].sort((a, b) => a - b),
    }
    for (const listener of listeners) {
      listener()
    }
  }

  const emit = (event: MidiEvent) => {
    for (const listener of events) {
      listener(event)
    }
  }

  const range = (): [number, number] => [
    pitchForKey('z', octave) ?? BASE_PITCH,
    pitchForKey('i', octave) ?? BASE_PITCH + 24,
  ]

  /** Let go of everything: switching off or shifting octave must not strand a note. */
  const releaseAll = () => {
    for (const pitch of down.values()) {
      emit({ kind: 'off', pitch })
    }
    down.clear()
  }

  const onKeyDown = (event: Event) => {
    if (!(event instanceof KeyboardEvent) || !playing) {
      return
    }
    // Auto-repeat would turn one held key into a stream of note-ons. The
    // held map answers it as well, for browsers that do not set repeat.
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) {
      return
    }
    const key = event.key.toLowerCase()
    if (down.has(key)) {
      return
    }
    const pitch = pitchForKey(key, octave)
    if (pitch === null) {
      return
    }
    event.preventDefault()
    down.set(key, pitch)
    emit({ kind: 'on', pitch, velocity: KEYS_VELOCITY })
    changed()
  }

  const onKeyUp = (event: Event) => {
    if (!(event instanceof KeyboardEvent)) {
      return
    }
    const key = event.key.toLowerCase()
    const pitch = down.get(key)
    if (pitch === undefined) {
      return
    }
    down.delete(key)
    emit({ kind: 'off', pitch })
    changed()
  }

  /** A window that loses focus keeps no keys down, whatever it was told last. */
  const onBlur = () => {
    if (down.size > 0) {
      releaseAll()
      changed()
    }
  }

  changed()

  return {
    get state() {
      return state
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setPlaying: (next) => {
      playing = next
      if (!next) {
        releaseAll()
      }
      changed()
    },
    shiftOctave: (by) => {
      const next = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, octave + by))
      if (next === octave) {
        return
      }
      // The keys held are about to mean other notes, so they stop meaning
      // the old ones first.
      releaseAll()
      octave = next
      changed()
    },
    onEvent: (listener) => {
      events.add(listener)
      return () => {
        events.delete(listener)
      }
    },
    attach: (target = document) => {
      target.addEventListener('keydown', onKeyDown)
      target.addEventListener('keyup', onKeyUp)
      window.addEventListener('blur', onBlur)
      return () => {
        target.removeEventListener('keydown', onKeyDown)
        target.removeEventListener('keyup', onKeyUp)
        window.removeEventListener('blur', onBlur)
      }
    },
  }
}

let keys: KeysInput | null = null

/** The app's one computer-keyboard input. */
export function appKeys(): KeysInput {
  keys ??= createKeysInput()
  return keys
}
