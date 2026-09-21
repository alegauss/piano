import {
  barAtTick,
  tickAtBar,
  type ResolvedTiming,
  type TimeSignatureEvent,
} from '@piano/score-format'

/**
 * Where the beats fall, from the time signature map.
 *
 * A beat is one unit of the meter's denominator, so 7/8 counts seven eighths
 * and 3/4 three quarters, and the first beat of every bar is accented. Bars
 * are the format's own, from barAtTick, so a pickup counts up into the first
 * downbeat and a meter change starts a bar exactly where the score says.
 */

export type Beat = {
  readonly tick: number
  /** The first beat of a bar. */
  readonly accent: boolean
}

/** The meter in force at a tick: the first one governs from the first full bar, as barAtTick reads it. */
export function meterAt(timing: ResolvedTiming, tick: number): TimeSignatureEvent {
  const [first] = timing.timeSignatures
  let found = first ?? { tick: 0, numerator: 4, denominator: 4 }
  for (const signature of timing.timeSignatures) {
    if (signature.tick <= tick) {
      found = signature
    }
  }
  return found
}

/** Ticks in one beat of a meter: one unit of its denominator. */
export function beatTicks(
  signature: Pick<TimeSignatureEvent, 'denominator'>,
  ticksPerQuarter: number,
): number {
  return (ticksPerQuarter * 4) / signature.denominator
}

/** The first beat at or after a tick. */
export function nextBeat(timing: ResolvedTiming, from: number): Beat {
  const { pickupTicks, ticksPerQuarter } = timing

  // In a pickup the beats count up to the first downbeat, so they are laid
  // back from its end rather than forward from the start of the piece.
  if (from < pickupTicks) {
    const beat = beatTicks(meterAt(timing, pickupTicks), ticksPerQuarter)
    const tick = pickupTicks - Math.floor((pickupTicks - from) / beat) * beat
    return { tick, accent: tick === pickupTicks }
  }

  const { bar, tickInBar } = barAtTick(timing, from)
  const barStart = from - tickInBar
  const beat = beatTicks(meterAt(timing, barStart), ticksPerQuarter)
  const into = Math.ceil(tickInBar / beat) * beat
  const nextBar = tickAtBar(timing, bar + 1)
  if (barStart + into >= nextBar) {
    return { tick: nextBar, accent: true }
  }
  return { tick: barStart + into, accent: into === 0 }
}

/** Every beat from a tick up to and including another. */
export function beatsBetween(timing: ResolvedTiming, from: number, to: number): Beat[] {
  const beats: Beat[] = []
  let beat = nextBeat(timing, from)
  while (beat.tick <= to) {
    beats.push(beat)
    beat = nextBeat(timing, beat.tick + 1)
  }
  return beats
}
