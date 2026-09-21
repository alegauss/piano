import type { Note } from './note'

/**
 * What separates a score that sounds like music from one that sounds like a
 * typewriter.
 *
 * None of it belongs on the note object. A pedal held across a bar line is one
 * event, not a flag repeated on forty notes, and a crescendo is a shape over
 * time rather than a property of each note it passes over. Putting them on
 * notes would mean editing forty things to change one, and the forty would
 * drift apart.
 *
 * All of it is optional. A score with no pedal and no dynamics plays flat but
 * plays, which is what keeps a model from having to be a musicologist before
 * it can be useful.
 */

/** The three pedals, by the MIDI controller numbers they have always had. */
export const PEDAL_CONTROLLERS = {
  sustain: 64,
  sostenuto: 66,
  softUnaCorda: 67,
} as const

export type PedalKind = keyof typeof PEDAL_CONTROLLERS

export type PedalEvent = {
  readonly tick: number
  readonly pedal: PedalKind
  /**
   * 0 to 127, not a switch.
   *
   * Half-pedalling is real and the format stores what was meant; throwing the
   * value away at the door would leave the one place that nuance was written
   * down holding a boolean.
   */
  readonly value: number
}

/** The written dynamic levels, quietest first. */
export const DYNAMIC_LEVELS = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'] as const

export type DynamicLevel = (typeof DYNAMIC_LEVELS)[number]

/**
 * How loud each level is, as a multiplier over the velocity a note already
 * carries. Centred on mf at 1, so a score with dynamics and one without play
 * at about the same loudness.
 */
const LEVEL_SCALE: Readonly<Record<DynamicLevel, number>> = {
  ppp: 0.35,
  pp: 0.5,
  p: 0.68,
  mp: 0.84,
  mf: 1,
  f: 1.18,
  ff: 1.35,
  fff: 1.5,
}

export type DynamicMark = {
  readonly tick: number
  readonly level: DynamicLevel
  /**
   * A ramp to another level, ending at this tick. A crescendo is
   * `{ tick, level: 'f', rampFrom: 'p', rampStart: <tick> }`: the shape is one
   * object rather than a mark on every note it crosses.
   */
  readonly rampFrom?: DynamicLevel
  readonly rampStart?: number
}

/** Marks on the note itself, because they are about that note and not about time. */
export type Articulation = 'staccato' | 'tenuto' | 'accent' | 'marcato'

/** How each articulation changes length and loudness, in one place. */
const ARTICULATION: Readonly<Record<Articulation, { length: number; velocity: number }>> = {
  staccato: { length: 0.5, velocity: 1 },
  tenuto: { length: 1, velocity: 1 },
  accent: { length: 1, velocity: 1.25 },
  marcato: { length: 0.7, velocity: 1.4 },
}

export type Expression = {
  readonly pedals?: readonly PedalEvent[]
  readonly dynamics?: readonly DynamicMark[]
}

/**
 * The dynamic multiplier in force at a tick.
 *
 * Walks the marks and interpolates inside a ramp. It is a multiplier, never a
 * replacement: a note written at an accent stays louder than its neighbours at
 * every point along a crescendo, which is the whole reason the two are
 * separate.
 */
export function dynamicScaleAt(dynamics: readonly DynamicMark[], tick: number): number {
  if (dynamics.length === 0) {
    return 1
  }

  const sorted = [...dynamics].sort((a, b) => a.tick - b.tick)
  let scale = 1

  for (const mark of sorted) {
    const rampStart = mark.rampStart
    const rampFrom = mark.rampFrom

    // At the ramp's own start tick the level is rampFrom, not whatever came
    // before: the crescendo begins there, it does not begin one tick later.
    if (
      rampFrom !== undefined &&
      rampStart !== undefined &&
      tick >= rampStart &&
      tick < mark.tick
    ) {
      const from = LEVEL_SCALE[rampFrom]
      const to = LEVEL_SCALE[mark.level]
      const span = mark.tick - rampStart
      const progress = span <= 0 ? 1 : (tick - rampStart) / span
      return from + (to - from) * progress
    }

    if (mark.tick <= tick) {
      scale = LEVEL_SCALE[mark.level]
    }
  }

  return scale
}

export type SoundingNote = {
  readonly note: Note
  /** 1 to 127 after dynamics and articulation. */
  readonly velocity: number
  /** Ticks, after articulation shortened or lengthened it. */
  readonly duration: number
}

/**
 * What the engine should actually play for a note.
 *
 * The one place written velocity, the dynamic in force and the note's own
 * articulation are combined. Scattering these rules is how a score comes to
 * sound different in the roll's preview than in playback.
 */
export function soundingNote(
  note: Note,
  expression: Expression | undefined,
  articulation?: Articulation,
): SoundingNote {
  const dynamics = expression?.dynamics ?? []
  const shaped =
    articulation === undefined ? { length: 1, velocity: 1 } : ARTICULATION[articulation]

  const velocity = Math.max(
    1,
    Math.min(
      127,
      Math.round(note.velocity * dynamicScaleAt(dynamics, note.start) * shaped.velocity),
    ),
  )

  return {
    note,
    velocity,
    duration: Math.max(1, Math.round(note.duration * shaped.length)),
  }
}

/**
 * Whether a pedal is down at a tick, and how far.
 *
 * Reading the event list rather than a per-note flag is what makes "held
 * across a bar line" one fact instead of forty.
 */
export function pedalValueAt(
  pedals: readonly PedalEvent[],
  pedal: PedalKind,
  tick: number,
): number {
  let value = 0
  for (const event of [...pedals].sort((a, b) => a.tick - b.tick)) {
    if (event.pedal !== pedal || event.tick > tick) {
      continue
    }
    value = event.value
  }
  return value
}

/** Problems in the expression events themselves. */
export function validateExpression(expression: Expression | undefined): string[] {
  const messages: string[] = []

  for (const event of expression?.pedals ?? []) {
    if (!Number.isInteger(event.tick) || event.tick < 0) {
      messages.push(
        `a ${event.pedal} event sits at tick ${String(event.tick)}, which is not a tick`,
      )
    }
    if (!Number.isInteger(event.value) || event.value < 0 || event.value > 127) {
      messages.push(
        `a ${event.pedal} event at tick ${String(event.tick)} has value ${String(event.value)}; pedal runs 0 to 127`,
      )
    }
  }

  for (const mark of expression?.dynamics ?? []) {
    if (mark.rampFrom !== undefined && mark.rampStart === undefined) {
      messages.push(
        `the ${mark.level} at tick ${String(mark.tick)} ramps from ${mark.rampFrom} but says nothing about where the ramp starts`,
      )
    }
    if (mark.rampStart !== undefined && mark.rampStart >= mark.tick) {
      messages.push(
        `the ${mark.level} at tick ${String(mark.tick)} starts its ramp at ${String(mark.rampStart)}, which is not before it`,
      )
    }
  }

  return messages
}
