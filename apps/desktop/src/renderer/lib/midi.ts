import { PEDAL_CONTROLLERS, type PedalKind } from '@piano/score-format'

/**
 * What a controller sent, in the shape the rest of the app speaks.
 *
 * Controllers differ, and the differences are all here so that nothing
 * downstream has to know about them. A note-on with velocity zero is a
 * release, which half the keyboards in the world send instead of a note-off.
 * A pedal is a control change on 64 and becomes a pedal event rather than a
 * number somebody has to remember, keeping its 0 to 127 so a half-pedal is
 * still a half-pedal: that is the range the score stores and the engine
 * takes, and rescaling it here would put a conversion in the one place
 * nothing downstream expects one.
 *
 * Running status — a message that omits its status byte and inherits the
 * previous one — cannot reach here: Web MIDI delivers whole messages, and a
 * two-byte fragment is treated as the malformed thing it would be.
 */

export type MidiEvent =
  | { readonly kind: 'on'; readonly pitch: number; readonly velocity: number }
  | { readonly kind: 'off'; readonly pitch: number }
  | {
      readonly kind: 'pedal'
      readonly pedal: PedalKind
      /** 0 to 127, as the score stores it and the engine takes it. */
      readonly value: number
    }
  /** Anything else: kept whole for the monitor, which is what diagnoses an odd controller. */
  | { readonly kind: 'other'; readonly status: number; readonly data: readonly number[] }

const NOTE_OFF = 0x80
const NOTE_ON = 0x90
const CONTROL_CHANGE = 0xb0

/** Which pedal a controller number is, from the score format's own table. */
function pedalOf(controller: number): PedalKind | null {
  for (const [pedal, number] of Object.entries(PEDAL_CONTROLLERS)) {
    if (number === controller) {
      return pedal as PedalKind
    }
  }
  return null
}

/**
 * Read one message. Null when there is nothing there at all; an 'other' event
 * when it is something this app does not act on but a human might want to
 * see.
 */
export function parseMidi(data: ArrayLike<number>): MidiEvent | null {
  const status = data[0]
  if (status === undefined || data.length < 2) {
    return null
  }
  const kind = status & 0xf0
  const first = data[1] ?? 0
  const second = data[2] ?? 0

  if (kind === NOTE_ON) {
    // Velocity zero is a release. Controllers that never send 0x80 rely on it.
    return second === 0
      ? { kind: 'off', pitch: first }
      : { kind: 'on', pitch: first, velocity: second }
  }
  if (kind === NOTE_OFF) {
    return { kind: 'off', pitch: first }
  }
  if (kind === CONTROL_CHANGE) {
    const pedal = pedalOf(first)
    if (pedal !== null) {
      return { kind: 'pedal', pedal, value: second }
    }
  }
  return { kind: 'other', status, data: Array.from(data) }
}

/** The message as a human reads it in the monitor. */
export function describeMidi(event: MidiEvent): string {
  switch (event.kind) {
    case 'on':
      return `note on ${String(event.pitch)} velocity ${String(event.velocity)}`
    case 'off':
      return `note off ${String(event.pitch)}`
    case 'pedal':
      return `${event.pedal} pedal ${String(event.value)}`
    default:
      return `${hex(event.status)} ${event.data.slice(1).map(hex).join(' ')}`
  }
}

function hex(value: number): string {
  return value.toString(16).padStart(2, '0')
}
