import { noteEnd, pitchToSpelling, voiceOf, type Note } from './note'
import { pedalValueAt, type PedalEvent } from './expression'
import { CHORD_TICKS, chordsOf, REACH_SEMITONES } from './reduce'
import { formatProblems } from './repair'
import { notesOf, timingOf, type Score } from './score'
import { barAtTick, beatTicks, meterAt, tickAtBar, ticksPerBar, type ResolvedTiming } from './time'

/**
 * Music that validates and is still probably wrong.
 *
 * The skill asks a model to read its finished score against a list of
 * mistakes that pass validation. That is a request, and a request is what a
 * model skips when it is sure of itself. Some of the list is arithmetic rather
 * than taste, and those are checked here: the hands crossing, a chord one hand
 * cannot span, a line holding more than its bar, and a bar that goes silent
 * before its end. The rest — a melody stuck in five notes, a beginner version
 * that is not easier — are judgements, and stay in the skill.
 *
 * They are warnings beside a valid result, never refusals, because each has a
 * legitimate exception: hands do cross, large hands do reach a tenth, and a
 * rest is a gap nobody wrote down. A validator that refused music it did not
 * understand would teach the model to write around it. Each one names the bar
 * and the notes, in the shape a refused score's problems already come in, so
 * a model can decide in one step whether the warning is the music or a slip.
 *
 * Only the notes as written are read. The checks about hands read the `hand`
 * a note names and leave a note without one alone: guessing a hand from pitch
 * would make the warning about the guess.
 */

export type WarningKind = 'hands crossed' | 'wide chord' | 'line overfull' | 'bar cut short'

export type ScoreWarning = {
  readonly kind: WarningKind
  /** The note it is about, as a JSON path such as notes.12. */
  readonly path: string
  /** The bar it is in, counted as a musician counts: the first full bar is 1. */
  readonly bar: number
  /** What the score has there. */
  readonly received: string
  /** What would usually be there instead, and when the score is right anyway. */
  readonly expected: string
  /** The change that would settle it, where one can be worked out. */
  readonly fix?: string
}

type Indexed = { readonly note: Note; readonly index: number }

/** Where a sustain pedal holds the strings, as MIDI reads a pedal: half down or more. */
const PEDAL_DOWN = 64

const spelled = (note: Note): string => pitchToSpelling(note.pitch)

/** Every warning for a score that has already validated. */
export function scoreWarnings(score: Score): ScoreWarning[] {
  const notes = notesOf(score)
  const timing = timingOf(score)
  const indexed = notes.map((note, index) => ({ note, index }))
  return [
    ...handsCrossed(indexed, timing),
    ...wideChords(indexed, timing),
    ...overfullLines(indexed, timing),
    ...barsCutShort(indexed, timing, score.expression?.pedals ?? []),
  ]
}

/** The warnings as prose, a few of each kind and the rest counted, like a refusal's problems. */
export function formatWarnings(warnings: readonly ScoreWarning[]): string {
  return formatProblems(
    warnings.map((warning) => ({
      ...warning,
      path: `${warning.path} (bar ${String(warning.bar)})`,
    })),
    'warnings',
  )
}

/**
 * The left hand's highest note above the right hand's lowest, in one bar.
 * That is what an octave miscounted in either hand looks like.
 */
function handsCrossed(notes: readonly Indexed[], timing: ResolvedTiming): ScoreWarning[] {
  const bars = new Map<number, { left?: Indexed; right?: Indexed }>()
  for (const one of notes) {
    if (one.note.hand === undefined) {
      continue
    }
    const { bar } = barAtTick(timing, one.note.start)
    const held = bars.get(bar) ?? {}
    if (
      one.note.hand === 'left' &&
      (held.left === undefined || one.note.pitch > held.left.note.pitch)
    ) {
      held.left = one
    }
    if (
      one.note.hand === 'right' &&
      (held.right === undefined || one.note.pitch < held.right.note.pitch)
    ) {
      held.right = one
    }
    bars.set(bar, held)
  }

  const warnings: ScoreWarning[] = []
  for (const [bar, { left, right }] of [...bars].sort(([one], [other]) => one - other)) {
    if (left === undefined || right === undefined || left.note.pitch <= right.note.pitch) {
      continue
    }
    warnings.push({
      kind: 'hands crossed',
      path: `notes.${String(left.index)}`,
      bar,
      received: `${spelled(left.note)} in the left hand, above the right hand's ${spelled(right.note)} (notes.${String(right.index)})`,
      expected:
        'the left hand below the right in each bar; keep it if the hands really cross there, ' +
        'otherwise one of the two is probably an octave out',
    })
  }
  return warnings
}

/** Notes one hand strikes together, spanning more than a hand holds. */
function wideChords(notes: readonly Indexed[], timing: ResolvedTiming): ScoreWarning[] {
  const where = new Map(notes.map((one) => [one.note, one.index]))
  const handed = notes.filter((one) => one.note.hand !== undefined).map((one) => one.note)
  const warnings: ScoreWarning[] = []
  for (const chord of chordsOf(handed)) {
    const low = chord.reduce((lowest, note) => (note.pitch < lowest.pitch ? note : lowest))
    const high = chord.reduce((highest, note) => (note.pitch > highest.pitch ? note : highest))
    const span = high.pitch - low.pitch
    if (span <= REACH_SEMITONES) {
      continue
    }
    warnings.push({
      kind: 'wide chord',
      path: `notes.${String(where.get(high) ?? 0)}`,
      bar: barAtTick(timing, low.start).bar,
      received:
        `${spelled(low)} to ${spelled(high)} struck at once by the ${String(high.hand)} hand, ` +
        `${String(span)} semitones apart`,
      expected:
        `an octave (${String(REACH_SEMITONES)} semitones) or less in one hand; a tenth is for ` +
        'large hands only, and anything wider is spread across both hands or rolled',
    })
  }
  return warnings
}

/**
 * One line, a hand's voice, where a note starts while the one before it is
 * still sounding and goes on past it. Its notes then add up to more than the
 * bar holds, which is what durations counted wrong look like: every quarter
 * written as a half runs each note into the next.
 *
 * A note wholly inside a longer one is left alone. That is a held note under
 * a figure, an inner voice written without its own number, which the skill
 * asks for but which is not a sum gone wrong. So is an overlap no longer than
 * notes struck together are apart, which is legato rather than arithmetic.
 */
function overfullLines(notes: readonly Indexed[], timing: ResolvedTiming): ScoreWarning[] {
  const lines = new Map<string, Indexed[]>()
  for (const one of notes) {
    if (one.note.hand === undefined) {
      continue
    }
    const key = `${one.note.hand}:${String(voiceOf(one.note))}`
    lines.set(key, [...(lines.get(key) ?? []), one])
  }

  const warnings: ScoreWarning[] = []
  for (const line of lines.values()) {
    line.sort((one, other) => one.note.start - other.note.start)
    // The note sounding longest so far, which is the one a later start cuts into.
    let holding: Indexed | null = null
    for (const one of line) {
      const runsInto =
        holding !== null &&
        one.note.start > holding.note.start &&
        noteEnd(holding.note) - one.note.start > CHORD_TICKS &&
        noteEnd(one.note) > noteEnd(holding.note)
      if (holding !== null && runsInto) {
        const meter = meterAt(timing, one.note.start)
        warnings.push({
          kind: 'line overfull',
          path: `notes.${String(holding.index)}`,
          bar: barAtTick(timing, one.note.start).bar,
          received:
            `${spelled(holding.note)} in the ${String(holding.note.hand)} hand, voice ` +
            `${String(voiceOf(holding.note))}, still sounding when notes.${String(one.index)} ` +
            `starts at tick ${String(one.note.start)}`,
          expected:
            `one note after another in a voice, so its bar holds no more than its ` +
            `${String(meter.numerator)}/${String(meter.denominator)}`,
          fix:
            `give notes.${String(holding.index)} a duration of ` +
            `${String(one.note.start - holding.note.start)}, or put the two in different voices`,
        })
      }
      if (holding === null || noteEnd(one.note) > noteEnd(holding.note)) {
        holding = one
      }
    }
  }
  return warnings.sort((one, other) => one.bar - other.bar)
}

/**
 * A bar where every hand has stopped at least a beat before the barline, and
 * the music picks up again exactly on the next downbeat. That is what a bar
 * with a beat missing from it looks like; a rest written on purpose looks the
 * same, which is why it is a warning. Shorter silences are articulation, a
 * sustain pedal down as the last note is let go carries it across, the pickup
 * is allowed to be short, and the piece is allowed to end.
 */
function barsCutShort(
  notes: readonly Indexed[],
  timing: ResolvedTiming,
  pedals: readonly PedalEvent[],
): ScoreWarning[] {
  const sorted = [...notes].sort((one, other) => one.note.start - other.note.start)
  const last = sorted.reduce((end, one) => Math.max(end, noteEnd(one.note)), 0)
  const lastBar = barAtTick(timing, Math.max(0, last - 1)).bar

  const warnings: ScoreWarning[] = []
  let cursor = 0
  // The note sounding latest among those started so far.
  let latest: Indexed | null = null
  for (let bar = 1; bar < lastBar; bar += 1) {
    const from = tickAtBar(timing, bar)
    const barline = tickAtBar(timing, bar + 1)
    let startsInBar = false
    while (cursor < sorted.length && (sorted[cursor]?.note.start ?? barline) < barline) {
      const one = sorted[cursor]
      cursor += 1
      if (one === undefined) {
        continue
      }
      startsInBar ||= one.note.start >= from
      if (latest === null || noteEnd(one.note) > noteEnd(latest.note)) {
        latest = one
      }
    }
    const resumes = sorted[cursor]?.note.start === barline
    if (latest === null || !startsInBar || !resumes) {
      continue
    }
    const silentFrom = noteEnd(latest.note)
    const meter = meterAt(timing, from)
    const beat = beatTicks(meter, timing.ticksPerQuarter)
    if (barline - silentFrom < beat || pedalValueAt(pedals, 'sustain', silentFrom) >= PEDAL_DOWN) {
      continue
    }
    const at = barAtTick(timing, silentFrom)
    const beats = (barline - silentFrom) / beat
    warnings.push({
      kind: 'bar cut short',
      path: `notes.${String(latest.index)}`,
      bar,
      received:
        `silence in every hand from beat ${String(at.tickInBar / beat + 1)} after ` +
        `notes.${String(latest.index)} ends, ${String(beats)} ${beats === 1 ? 'beat' : 'beats'} ` +
        'before the next bar, which starts on its downbeat',
      expected:
        `a bar that holds its ${String(meter.numerator)}/${String(meter.denominator)} ` +
        `(${String(ticksPerBar(meter, timing.ticksPerQuarter))} ticks); a rest there is ` +
        'fine if it is meant, and a beat left out is not',
    })
  }
  return warnings
}
