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

import { noteEnd, type Hand, type Note } from './note'

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

/**
 * The shortest figure written here. A duration below it is spelled as it
 * anyway, which the leftover reports as a negative number rather than hiding.
 */
const SHORTEST_DENOMINATOR = 64

/** The note values, as the denominator each is a fraction of a whole note by. */
const FIGURE_DENOMINATORS = [1, 2, 4, 8, 16, 32, SHORTEST_DENOMINATOR]

/** Dots a figure may carry. A third dot exists and next to nobody writes one. */
const MAX_DOTS = 2

/**
 * A written note value: what a reader sees where the format stores a tick count.
 *
 * Both halves are needed because neither implies the other. The denominator
 * alone cannot say a dotted quarter, and the dots alone say nothing at all.
 */
export type Figure = {
  /** 1 is a whole note, 2 a half, 4 a quarter, 8 an eighth. */
  readonly denominator: number
  /** Augmentation dots. Each one adds half of everything before it. */
  readonly dots: number
}

const SHORTEST: Figure = { denominator: SHORTEST_DENOMINATOR, dots: 0 }

/** How long a figure lasts: the plain value, plus half again for each dot. */
export function figureTicks(figure: Figure, ticksPerQuarter: number): number {
  return ((ticksPerQuarter * 4) / figure.denominator) * (2 - 2 ** -figure.dots)
}

/**
 * A figure's length as a fraction of a whole note.
 *
 * Which is the order the figures are searched in, and it does not depend on the
 * tick grid: ticks per quarter scales every figure by the same factor.
 */
function figureWholes(figure: Figure): number {
  return (2 - 2 ** -figure.dots) / figure.denominator
}

/** Every figure and dotting there is, longest first. */
const FIGURES: readonly Figure[] = FIGURE_DENOMINATORS.flatMap((denominator) =>
  Array.from({ length: MAX_DOTS + 1 }, (_unused, dots): Figure => ({ denominator, dots })),
).sort((one, other) => figureWholes(other) - figureWholes(one))

export type FigureFit = {
  readonly figure: Figure
  /** Ticks the figure spells, dots included. */
  readonly ticks: number
  /**
   * What the figure does not spell.
   *
   * Positive where no single figure is long enough — a triplet, five
   * sixteenths, a note tied over a barline — and the caller decides between
   * tying the leftover and rounding it away. Negative only below the shortest
   * figure, where the spelling is longer than the duration it stands for.
   */
  readonly remainder: number
}

/**
 * Which figure a tick count is written as.
 *
 * The longest figure that fits, and what it leaves over. Nothing is refused and
 * nothing is rounded here, because the two callers want opposite things from a
 * duration that lands between figures: a stave ties it to a second figure,
 * while a list of figures for a model to read rounds it and says so. Handing
 * back the leftover lets each one decide, and calling this again on the
 * leftover is how a tie chain gets built.
 *
 * Powers of two and up to two dots collide at no length, so the answer is the
 * only figure of that length and not one reading among several.
 */
export function ticksToFigure(ticks: number, ticksPerQuarter: number): FigureFit {
  let chosen = SHORTEST
  for (const figure of FIGURES) {
    if (figureTicks(figure, ticksPerQuarter) <= ticks) {
      chosen = figure
      break
    }
  }
  const spelled = figureTicks(chosen, ticksPerQuarter)
  return { figure: chosen, ticks: spelled, remainder: ticks - spelled }
}

/** One figure of a bar, or one rest. */
export type BarFigure = {
  /** Ticks from the start of the piece, so it needs no bar to be read against. */
  readonly start: number
  /** How long it runs, which is what the figure was fitted to. */
  readonly ticks: number
  readonly figure: Figure
  /** What the figure leaves of those ticks, as `ticksToFigure` reports it. */
  readonly remainder: number
  /**
   * The notes it shows, struck at its start or held into it from earlier.
   * Empty makes it a rest, which is all a rest is in this format: a gap.
   *
   * Ties are read off the notes rather than flagged, because the note carries
   * the whole answer: one starting before this figure is tied into it, and one
   * ending after `start + ticks` is tied out of it.
   */
  readonly notes: readonly Note[]
}

/**
 * The figures and rests that fill one bar of one hand.
 *
 * Every notation reader wants this same reading of the same ticks, and each
 * would otherwise write its own quantiser: the sheet view, a MusicXML export,
 * the skill listing a bar back to a model. So it lives here, beside the bar
 * arithmetic it is built on.
 *
 * The bar is tiled without gaps. Each onset opens a figure that runs to
 * whichever comes first of its own notes ending, the next onset, and the
 * barline; where the notes stop before the next onset, the silence between them
 * is a rest, because a rest in this format is a gap and nothing else. A note
 * crossing the barline is clipped at it and appears again in the next bar.
 *
 * One line per hand, which is the simplification a single stave makes anyway: a
 * note still sounding when the same hand strikes another stays with the earlier
 * figure, and a caller drawing a second voice reads the notes' own `voice`.
 * Without a hand, every note in the bar is read as one line, which is what a
 * score that names no hands has.
 */
export function barFigures(
  timing: ResolvedTiming,
  notes: readonly Note[],
  bar: number,
  hand?: Hand,
): BarFigure[] {
  const from = tickAtBar(timing, bar)
  const barline = tickAtBar(timing, bar + 1)
  if (barline <= from) {
    return []
  }

  const line = notes.filter((note) => hand === undefined || note.hand === hand)
  const onsets = new Map<number, Note[]>()
  for (const note of line) {
    if (note.start < from || note.start >= barline) {
      continue
    }
    onsets.set(note.start, [...(onsets.get(note.start) ?? []), note])
  }

  // Anything still sounding on the downbeat opens the bar, rather than a rest
  // standing where a note from the bar before is being held through.
  const held = line.filter((note) => note.start < from && noteEnd(note) > from)
  if (held.length > 0) {
    onsets.set(from, [...held, ...(onsets.get(from) ?? [])])
  }

  const points = [...onsets.keys()].sort((one, other) => one - other)
  const figures: BarFigure[] = []
  let cursor = from

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (point === undefined) {
      break
    }
    if (point > cursor) {
      figures.push(fitted(cursor, point - cursor, [], timing.ticksPerQuarter))
    }
    const sounding = onsets.get(point) ?? []
    const ends = sounding.reduce((end, note) => Math.max(end, noteEnd(note)), point)
    const until = Math.min(ends, points[index + 1] ?? barline, barline)
    figures.push(fitted(point, until - point, sounding, timing.ticksPerQuarter))
    cursor = until
  }

  if (cursor < barline) {
    figures.push(fitted(cursor, barline - cursor, [], timing.ticksPerQuarter))
  }
  return figures
}

function fitted(
  start: number,
  ticks: number,
  notes: readonly Note[],
  ticksPerQuarter: number,
): BarFigure {
  const fit = ticksToFigure(ticks, ticksPerQuarter)
  return { start, ticks, figure: fit.figure, remainder: fit.remainder, notes }
}
