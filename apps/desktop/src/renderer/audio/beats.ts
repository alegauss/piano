import { barAtTick, beatTicks, meterAt, tickAtBar, type ResolvedTiming } from '@piano/score-format'

/**
 * Where the beats fall, from the time signature map.
 *
 * A beat is one unit of the meter's denominator, so 7/8 counts seven eighths
 * and 3/4 three quarters, and the first beat of every bar is accented. Bars
 * are the format's own, from barAtTick, so a pickup counts up into the first
 * downbeat and a meter change starts a bar exactly where the score says.
 *
 * Which meter governs a tick, and how long its beat is, are the format's
 * questions and are asked of it: the reduction rules count beats too, and two
 * answers to where a beat falls would be two pieces.
 */

export { beatTicks, meterAt }

export type Beat = {
  readonly tick: number
  /** The first beat of a bar. */
  readonly accent: boolean
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
