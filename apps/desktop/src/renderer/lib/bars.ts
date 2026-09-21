import { barAtTick, tickAtBar, type ResolvedTiming } from '@piano/score-format'

import { beatsBetween, meterAt } from '../audio/beats'

/**
 * The lines that give the field something to count.
 *
 * Bars come from the time signature map rather than a fixed division, so a
 * piece that changes meter draws correctly and a pickup is bar 0 rather than
 * a mislabelled bar one. Beats come from the same place the metronome's do,
 * which is why a clicked beat and a drawn line are never a pixel apart.
 *
 * Bar numbers are the vocabulary the rest of the app speaks: a loop, a
 * practice range and an MCP command all name bars, so the number drawn here
 * is the number typed there.
 */

export type GridLine = {
  readonly tick: number
  /** The bar it begins, when it is a downbeat. */
  readonly bar: number
  /** A bar line, as against a beat inside a bar. */
  readonly downbeat: boolean
}

/** Every bar and beat line from one tick to another, in order. */
export function gridLines(timing: ResolvedTiming, from: number, to: number): GridLine[] {
  const lines: GridLine[] = []
  for (const beat of beatsBetween(timing, Math.max(0, from), to)) {
    lines.push({
      tick: beat.tick,
      bar: barAtTick(timing, beat.tick).bar,
      downbeat: beat.accent,
    })
  }
  return lines
}

/** The bar a tick is in, from its first tick to the first tick of the next. */
export function barRange(
  timing: ResolvedTiming,
  tick: number,
): { readonly bar: number; readonly start: number; readonly end: number } {
  const { bar, tickInBar } = barAtTick(timing, Math.max(0, tick))
  const start = Math.max(0, tick) - tickInBar
  return { bar, start, end: tickAtBar(timing, bar + 1) }
}

/**
 * The stretch two ticks cover, rounded out to whole bars.
 *
 * A loop dragged across the roll snaps to bars because that is what a player
 * means by "this bit again": a loop that starts a quaver into the bar throws
 * the count out on every pass.
 */
export function barsBetween(
  timing: ResolvedTiming,
  one: number,
  other: number,
): { readonly start: number; readonly end: number } {
  const low = barRange(timing, Math.min(one, other))
  const high = barRange(timing, Math.max(one, other))
  return { start: low.start, end: Math.max(high.end, low.end) }
}

/** How many ticks a bar lasts at a tick, for a caller sizing something to it. */
export function barTicksAt(timing: ResolvedTiming, tick: number): number {
  const meter = meterAt(timing, tick)
  return (timing.ticksPerQuarter * 4 * meter.numerator) / meter.denominator
}
