/**
 * Where things happen in a score.
 *
 * Positions are integers on a ticks grid and seconds are never stored. That
 * one decision is what survives the operations this app exists to perform:
 * halving the tempo to practise, looping four bars, transposing, and a piece
 * that changes tempo mid-phrase. Stored as seconds, every one of those would
 * mean rewriting the whole score, and rounding error would accumulate across a
 * long piece until the last bar drifted audibly from the first.
 *
 * The playback clock converts ticks to seconds by walking the tempo map. It is
 * the only place that conversion happens.
 */

/** What most sequencers use, so an imported MIDI file usually needs no rescaling. */
export const DEFAULT_TICKS_PER_QUARTER = 480

/** 120 bpm, in the microseconds-per-quarter unit a MIDI file carries. */
export const DEFAULT_MICROSECONDS_PER_QUARTER = 500_000

const MICROSECONDS_PER_SECOND = 1_000_000

/**
 * A tempo change, spelled as MIDI spells it. Microseconds per quarter rather
 * than beats per minute because it is exact: 120 bpm is 500000 on the nose,
 * where a third of a beat per minute is not representable either way round.
 */
export type TempoEvent = {
  readonly tick: number
  readonly microsecondsPerQuarter: number
}

/** A meter change. Bar lines and bar numbers are derived from these, never stored per note. */
export type TimeSignatureEvent = {
  readonly tick: number
  readonly numerator: number
  /** A power of two: 4 is a quarter, 8 an eighth. */
  readonly denominator: number
}

export type Timing = {
  readonly ticksPerQuarter?: number
  readonly tempo?: readonly TempoEvent[]
  readonly timeSignatures?: readonly TimeSignatureEvent[]
  /**
   * How much music comes before the first full bar.
   *
   * A pickup is stated rather than inferred: the alternative is every reader
   * guessing from the first note, and they would not all guess the same.
   */
  readonly pickupTicks?: number
}

/** Timing with every default applied, which is what everything downstream reads. */
export type ResolvedTiming = {
  readonly ticksPerQuarter: number
  readonly tempo: readonly TempoEvent[]
  readonly timeSignatures: readonly TimeSignatureEvent[]
  readonly pickupTicks: number
}

/**
 * Fill in what a score left out.
 *
 * A score with no timing at all is valid and means 480 ticks per quarter, 120
 * bpm, four four, no pickup. Keeping the cost of entry near zero is what lets
 * a model write a quick melody without first building a tempo map.
 */
export function resolveTiming(timing: Timing | undefined): ResolvedTiming {
  const ticksPerQuarter = timing?.ticksPerQuarter ?? DEFAULT_TICKS_PER_QUARTER
  const tempo =
    timing?.tempo !== undefined && timing.tempo.length > 0
      ? [...timing.tempo].sort((a, b) => a.tick - b.tick)
      : [{ tick: 0, microsecondsPerQuarter: DEFAULT_MICROSECONDS_PER_QUARTER }]
  const timeSignatures =
    timing?.timeSignatures !== undefined && timing.timeSignatures.length > 0
      ? [...timing.timeSignatures].sort((a, b) => a.tick - b.tick)
      : [{ tick: 0, numerator: 4, denominator: 4 }]

  return {
    ticksPerQuarter,
    tempo,
    timeSignatures,
    pickupTicks: timing?.pickupTicks ?? 0,
  }
}

/** How long one tick lasts under a given tempo. */
function secondsPerTick(microsecondsPerQuarter: number, ticksPerQuarter: number): number {
  return microsecondsPerQuarter / MICROSECONDS_PER_SECOND / ticksPerQuarter
}

/**
 * Convert a tick to a time in seconds from the start of the piece.
 *
 * Walks the tempo map, accumulating whole segments before the tick and then
 * the remainder of the segment containing it. This is the one place the
 * conversion lives; nothing else is allowed its own copy, because two copies
 * that disagree by a rounding step produce a roll that slides away from the
 * sound over the course of a piece.
 */
export function ticksToSeconds(timing: ResolvedTiming, tick: number): number {
  const { ticksPerQuarter, tempo } = timing
  let seconds = 0
  let previousTick = 0
  let microsecondsPerQuarter = DEFAULT_MICROSECONDS_PER_QUARTER

  for (const event of tempo) {
    if (event.tick >= tick) {
      break
    }
    seconds += (event.tick - previousTick) * secondsPerTick(microsecondsPerQuarter, ticksPerQuarter)
    previousTick = event.tick
    microsecondsPerQuarter = event.microsecondsPerQuarter
  }

  return seconds + (tick - previousTick) * secondsPerTick(microsecondsPerQuarter, ticksPerQuarter)
}

/**
 * The inverse, for a scrubber: the user drags to a time and the transport has
 * to know which tick that is. Exact rather than a search, by walking the same
 * segments in the other direction.
 */
export function secondsToTicks(timing: ResolvedTiming, seconds: number): number {
  const { ticksPerQuarter, tempo } = timing
  let elapsed = 0
  let previousTick = 0
  let microsecondsPerQuarter = DEFAULT_MICROSECONDS_PER_QUARTER

  for (const event of tempo) {
    const segment =
      (event.tick - previousTick) * secondsPerTick(microsecondsPerQuarter, ticksPerQuarter)
    if (elapsed + segment > seconds) {
      break
    }
    elapsed += segment
    previousTick = event.tick
    microsecondsPerQuarter = event.microsecondsPerQuarter
  }

  const remaining = seconds - elapsed
  return previousTick + remaining / secondsPerTick(microsecondsPerQuarter, ticksPerQuarter)
}

/** The meter in force at a tick: the first one governs from the first full bar. */
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

/** How many ticks one bar of this meter lasts. */
export function ticksPerBar(
  signature: Pick<TimeSignatureEvent, 'numerator' | 'denominator'>,
  ticksPerQuarter: number,
): number {
  return (ticksPerQuarter * 4 * signature.numerator) / signature.denominator
}

export type BarPosition = {
  /** The pickup is bar 0; the first full bar is bar 1, as a musician counts. */
  readonly bar: number
  /** How far into that bar, in ticks. */
  readonly tickInBar: number
}

/**
 * Which bar a tick falls in.
 *
 * Bars are counted the way somebody reading the score counts them: the first
 * full bar is bar 1, and anything before it is the pickup, bar 0. Walking the
 * time signature map rather than dividing by a constant is what makes a piece
 * that changes meter number its bars continuously across the change.
 */
export function barAtTick(timing: ResolvedTiming, tick: number): BarPosition {
  const { ticksPerQuarter, timeSignatures, pickupTicks } = timing

  if (tick < pickupTicks) {
    return { bar: 0, tickInBar: tick }
  }

  let bar = 1
  let cursor = pickupTicks

  for (let index = 0; index < timeSignatures.length; index += 1) {
    const signature = timeSignatures[index]
    if (signature === undefined) {
      break
    }
    const next = timeSignatures[index + 1]
    const barTicks = ticksPerBar(signature, ticksPerQuarter)
    // Where this meter stops applying: the next change, or the end of time.
    const until = next === undefined ? Number.POSITIVE_INFINITY : Math.max(next.tick, cursor)

    if (tick < until) {
      const offset = tick - cursor
      return { bar: bar + Math.floor(offset / barTicks), tickInBar: offset % barTicks }
    }

    const span = until - cursor
    bar += Math.ceil(span / barTicks)
    cursor = until
  }

  return { bar, tickInBar: tick - cursor }
}

/**
 * The first tick of a bar, which is what a loop selector and the MCP transport
 * tools both need in order to speak in bars rather than in ticks.
 */
export function tickAtBar(timing: ResolvedTiming, bar: number): number {
  const { ticksPerQuarter, timeSignatures, pickupTicks } = timing

  if (bar <= 0) {
    return 0
  }

  let currentBar = 1
  let cursor = pickupTicks

  for (let index = 0; index < timeSignatures.length; index += 1) {
    const signature = timeSignatures[index]
    if (signature === undefined) {
      break
    }
    const next = timeSignatures[index + 1]
    const barTicks = ticksPerBar(signature, ticksPerQuarter)
    const until = next === undefined ? Number.POSITIVE_INFINITY : Math.max(next.tick, cursor)
    const barsHere = Math.ceil((until - cursor) / barTicks)

    if (bar - currentBar < barsHere) {
      return cursor + (bar - currentBar) * barTicks
    }

    currentBar += barsHere
    cursor = until
  }

  return cursor
}

/**
 * The tick range a bar range covers, inclusive of both bars.
 *
 * Asking for bars 12 to 20 is as common as asking for a named section, and
 * both have to resolve through this one function so that a loop set by
 * dragging and a loop set from a chat message land on the same ticks.
 */
export function barRangeToTicks(
  timing: ResolvedTiming,
  fromBar: number,
  toBar: number,
): { readonly start: number; readonly end: number } {
  const start = tickAtBar(timing, Math.min(fromBar, toBar))
  const end = tickAtBar(timing, Math.max(fromBar, toBar) + 1)
  return { start, end }
}
