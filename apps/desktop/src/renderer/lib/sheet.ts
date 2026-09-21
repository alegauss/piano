import {
  barAtTick,
  barFigures,
  meterAt,
  noteEnd,
  pitchToSpelling,
  tickAtBar,
  type BarFigure,
  type Hand,
  type Note,
  type ResolvedTiming,
} from '@piano/score-format'

/**
 * The score as a page of staves, worked out before anything is drawn.
 *
 * Engraving splits in two, the way the roll does: what goes where is
 * arithmetic over the score, and putting glyphs on a stave is VexFlow's job.
 * This half is the arithmetic, so a claim about which clef a hand gets or how
 * many bars fit across the panel is a unit test rather than a screenshot.
 *
 * Everything here is inference, because the format stores none of it. There
 * are no clefs, so hand stands in for one; there is no key signature over
 * time, only a free-form string in the metadata; and there are no rests, so a
 * gap is one. The plan says what it inferred and leaves saying so to the page.
 */

export type Clef = 'treble' | 'bass'

/** The whole of the clef inference: the hand a note names, and nothing else. */
const CLEF_OF: Readonly<Record<Hand, Clef>> = { right: 'treble', left: 'bass' }

/** Treble above bass, as a grand staff is written. */
const STAVES: readonly Hand[] = ['right', 'left']

/** The line a rest sits on, which is a convention rather than a pitch. */
const REST_KEY: Readonly<Record<Clef, string>> = { treble: 'b/4', bass: 'd/3' }

/** A figure as VexFlow names it. */
const DURATIONS: Readonly<Record<number, string>> = {
  1: 'w',
  2: 'h',
  4: 'q',
  8: '8',
  16: '16',
  32: '32',
  64: '64',
}

/**
 * The thirty key signatures there are. A string outside this list is dropped
 * rather than guessed at: metadata.key is free-form, and a signature invented
 * from an unparsed one would be wrong on the page rather than missing from it.
 */
const KEY_SIGNATURES: readonly string[] = [
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'C#',
  'F',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'Gb',
  'Cb',
  'Am',
  'Em',
  'Bm',
  'F#m',
  'C#m',
  'G#m',
  'D#m',
  'A#m',
  'Dm',
  'Gm',
  'Cm',
  'Fm',
  'Bbm',
  'Ebm',
  'Abm',
]

const KEY = /^([A-G])(#|b)?\s*(m|min|minor|maj|major)?$/
const MINOR: readonly string[] = ['m', 'min', 'minor']

/** A spelling as note.ts writes one: a letter, what is done to it, an octave. */
const SPELLED = /^([A-G])(#{1,2}|b{1,2})?(-1|\d)$/

/**
 * CSS pixels one figure needs, measured rather than chosen.
 *
 * VexFlow's own formatter answers what a bar needs before anything is drawn,
 * and across 4, 8, 12 and 16 figures it asks for 110, 221, 331 and 442 px: a
 * straight line at about 27.6 px a figure, and a chord costs no more than a
 * single note. Rounded up, because an accidental or a dot widens a figure and
 * a page that is a little loose reads, where one that is a little tight does
 * not.
 */
const FIGURE_WIDTH = 30

/** What even a bar of one note is given, so a sparse page is not a row of slivers. */
const MIN_BAR_WIDTH = 120

/** What a system's first bar needs on top, for its clef, key signature and meter. */
const HEAD_WIDTH = 76

/** The page's own margin, and the room between one system and the next. */
const MARGIN = 16
const SYSTEM_GAP = 28

/** One stave and the space under it. */
export const STAVE_HEIGHT = 92

export type SheetNote = {
  /**
   * Where it sits on the page, which is how a highlight reaches the glyph the
   * engraver drew for it. Kept by the plan so following playback is a lookup
   * rather than a DOM query, and never re-engraves anything.
   */
  readonly id: string
  /** Ticks from the start of the piece, the figure's own start. */
  readonly start: number
  /** Pitches as VexFlow spells them, such as `c#/4`; a rest carries its line. */
  readonly keys: readonly string[]
  /**
   * The score's own notes behind the glyph, empty for a rest.
   *
   * Carried rather than reduced to pitches because the grader knows a note by
   * its own start, and a note tied over a barline starts before the figure
   * that shows its far end.
   */
  readonly shows: readonly Note[]
  readonly duration: string
  readonly dots: number
  /** One per key, empty where the spelling asks for no accidental. */
  readonly accidentals: readonly string[]
  readonly rest: boolean
  /** Ticks the figure did not spell, which is what the page owes a reader. */
  readonly leftover: number
}

export type SheetStave = {
  readonly clef: Clef
  readonly notes: readonly SheetNote[]
}

export type SheetBar = {
  /** Counted as a musician counts: the pickup is 0 and the first full bar is 1. */
  readonly bar: number
  /** It opens a system, so it carries the clef and the key signature again. */
  readonly head: boolean
  /** Shown where a system opens or the meter changes, and left off otherwise. */
  readonly meter?: string
  /**
   * The meter in force here whether or not the bar shows it, because beam
   * groups come from it and every bar has them, not only the ones that
   * announce a change.
   */
  readonly signature: { readonly numerator: number; readonly denominator: number }
  readonly key?: string
  readonly x: number
  readonly width: number
  /** One per clef, in the order they are stacked. */
  readonly staves: readonly SheetStave[]
}

export type SheetSystem = {
  readonly y: number
  readonly bars: readonly SheetBar[]
}

export type SheetPlan = {
  readonly clefs: readonly Clef[]
  readonly systems: readonly SheetSystem[]
  readonly width: number
  readonly height: number
  /**
   * Figures whose span no single figure spelled, so the page rounded them.
   * A triplet is the ordinary cause, and a reader is owed the count.
   */
  readonly leftovers: number
}

export type SheetInput = {
  readonly timing: ResolvedTiming
  /** Already filtered: what the parts panel hides is hidden here too. */
  readonly notes: readonly Note[]
  /** metadata.key exactly as the file spells it, which may be anything at all. */
  readonly key?: string
  /** The panel's width in CSS pixels, which is what decides the wrapping. */
  readonly width: number
}

/**
 * How long one beam group lasts, as a fraction of a whole note, or nothing
 * where the meter does not say.
 *
 * A group is one beat, and which note value that is depends on the meter:
 * simple time counts a quarter, compound time a dotted quarter, and the two
 * cannot be told apart from the denominator alone — 6/8 is two dotted beats
 * and 7/8 is nobody's business to guess at.
 *
 * So an odd meter gets nothing. A row of flags says truthfully that the page
 * does not know where the beat falls, where beams grouped wrongly would assert
 * a beat the music has not got.
 *
 * Here rather than beside the drawing, because it is arithmetic about a meter
 * and the page has to be able to say it left a bar unbeamed.
 */
export function beamGroup(
  signature: SheetBar['signature'],
): { readonly numerator: number; readonly denominator: number } | null {
  const { numerator, denominator } = signature
  if (denominator === 2 || denominator === 4) {
    return { numerator: 1, denominator: 4 }
  }
  if (denominator === 8 && numerator % 3 === 0) {
    return { numerator: 3, denominator: 8 }
  }
  return null
}

/**
 * The key signature a free-form string names, or nothing.
 *
 * `metadata.key` is prose: "Bb", "bb major" and "F# minor" all mean a
 * signature, and "modal-ish" means none. The letter's case is fixed and the
 * word after it lowered before matching, so the spelling somebody used does
 * not decide whether their key is read.
 */
export function keySignature(key: string | undefined): string | undefined {
  if (key === undefined) {
    return undefined
  }
  const tidy = key.trim()
  const match = KEY.exec(`${tidy.slice(0, 1).toUpperCase()}${tidy.slice(1).toLowerCase()}`)
  if (match === null) {
    return undefined
  }
  const [, letter = '', accidental = '', mode] = match
  const minor = mode !== undefined && MINOR.includes(mode)
  const spelled = `${letter}${accidental}${minor ? 'm' : ''}`
  return KEY_SIGNATURES.includes(spelled) ? spelled : undefined
}

/**
 * How a note is written: the key VexFlow places it by, and the accidental to
 * draw beside it.
 *
 * The spelling where the score carries one, because that is somebody's
 * decision about the music, and the sharps-upward fallback where it does not.
 * A spelling that is not a spelling falls back rather than being trusted; the
 * format's own validator is what refuses one that disagrees with its pitch.
 */
function spell(note: Note): { readonly key: string; readonly accidental: string } {
  const written = note.spelling === undefined ? null : SPELLED.exec(note.spelling)
  const match = written ?? SPELLED.exec(pitchToSpelling(note.pitch))
  if (match === null) {
    return { key: 'c/4', accidental: '' }
  }
  const [, letter = 'C', accidental = '', octave = '4'] = match
  return { key: `${letter.toLowerCase()}${accidental}/${octave}`, accidental }
}

function written(figure: BarFigure, clef: Clef, id: string): SheetNote {
  const duration = DURATIONS[figure.figure.denominator] ?? 'q'
  const shared = {
    id,
    start: figure.start,
    duration,
    dots: figure.figure.dots,
    leftover: figure.remainder,
  }
  if (figure.notes.length === 0) {
    return { ...shared, keys: [REST_KEY[clef]], shows: [], accidentals: [], rest: true }
  }
  const spelled = figure.notes.map((note) => spell(note))
  return {
    ...shared,
    keys: spelled.map((one) => one.key),
    shows: figure.notes,
    accidentals: spelled.map((one) => one.accidental),
    rest: false,
  }
}

/** A bar with everything but its place on the page settled. */
type Drafted = Omit<SheetBar, 'head' | 'x' | 'width'> & {
  /** The room its figures need before any system is justified. */
  readonly natural: number
  readonly changed: boolean
}

/**
 * The whole page: which staves, which bars on which system, and where.
 *
 * Width follows content. A bar of sixteen sixteenths needs about four times
 * the room of a bar of four, and giving every bar an equal share is what put
 * the notes of a busy one on top of each other. So each bar asks for what its
 * figures need, bars are packed into a system until the next will not fit, and
 * the slack is shared out so the system fills the width — which is what
 * justification means on an engraved page.
 *
 * The last system is left at its natural width rather than stretched, as a
 * printed page leaves it: three bars pulled across a whole page read as a
 * mistake.
 *
 * A system whose bars need more than the panel has is left wider than the
 * panel rather than squeezed back into it. Squeezing is the defect; scrolling
 * across is the answer, and the page reports the width it actually needs.
 */
export function planSheet({ timing, notes, key, width }: SheetInput): SheetPlan {
  const hands = STAVES.filter((hand) => notes.some((note) => note.hand === hand))
  // A score naming no hands is one line, not an empty grand staff.
  const lines: readonly { readonly clef: Clef; readonly hand?: Hand }[] =
    hands.length === 0 ? [{ clef: 'treble' }] : hands.map((hand) => ({ clef: CLEF_OF[hand], hand }))
  const clefs = lines.map((line) => line.clef)

  const end = notes.reduce((last, note) => Math.max(last, noteEnd(note)), 0)
  const first = timing.pickupTicks > 0 ? 0 : 1
  const last = end === 0 ? first - 1 : barAtTick(timing, end - 1).bar
  const signature = keySignature(key)

  const room = Math.max(width - MARGIN * 2, HEAD_WIDTH + MIN_BAR_WIDTH)
  const systemHeight = lines.length * STAVE_HEIGHT + SYSTEM_GAP

  let leftovers = 0
  const drafted: Drafted[] = []
  for (let bar = first; bar <= last; bar += 1) {
    const meter = meterAt(timing, tickAtBar(timing, bar))
    const before = bar > first ? meterAt(timing, tickAtBar(timing, bar - 1)) : null
    const staves = lines.map((line, at) => ({
      clef: line.clef,
      notes: barFigures(timing, notes, bar, line.hand).map((figure, index) =>
        written(figure, line.clef, `${String(bar)}:${String(at)}:${String(index)}`),
      ),
    }))
    leftovers += staves.reduce(
      (count, stave) => count + stave.notes.filter((one) => one.leftover !== 0).length,
      0,
    )
    // The busiest stave decides: the hands are formatted together, so a bar is
    // as wide as whichever of them holds the most.
    const figures = staves.reduce((most, stave) => Math.max(most, stave.notes.length), 0)
    drafted.push({
      bar,
      staves,
      signature: { numerator: meter.numerator, denominator: meter.denominator },
      natural: Math.max(MIN_BAR_WIDTH, figures * FIGURE_WIDTH),
      changed:
        before === null ||
        before.numerator !== meter.numerator ||
        before.denominator !== meter.denominator,
    })
  }

  const rows = packed(drafted, room)
  const systems: SheetSystem[] = []
  let widest = 0

  rows.forEach((row, index) => {
    const natural = row.reduce((total, one) => total + one.natural, 0)
    // Never below natural, so a system too wide for the panel stays readable;
    // and never stretched on the last row, which a printed page leaves short.
    const stretch =
      index === rows.length - 1 ? 1 : Math.max(1, (room - HEAD_WIDTH) / Math.max(natural, 1))
    const bars: SheetBar[] = []
    let x = MARGIN
    row.forEach((one, at) => {
      const head = at === 0
      const barWidth = one.natural * stretch + (head ? HEAD_WIDTH : 0)
      bars.push({
        bar: one.bar,
        head,
        x,
        width: barWidth,
        staves: one.staves,
        signature: one.signature,
        ...(head || one.changed
          ? {
              meter: `${String(one.signature.numerator)}/${String(one.signature.denominator)}`,
            }
          : {}),
        ...(head && signature !== undefined ? { key: signature } : {}),
      })
      x += barWidth
    })
    widest = Math.max(widest, x - MARGIN)
    systems.push({ y: MARGIN + index * systemHeight, bars })
  })

  return {
    clefs,
    systems,
    width: Math.max(width, widest + MARGIN * 2),
    height: MARGIN * 2 + systems.length * systemHeight,
    leftovers,
  }
}

/**
 * Bars gathered into systems, each filled until the next bar will not fit.
 *
 * A bar that is too wide for an empty system still gets one to itself: the
 * alternative is dropping it, and a page that is wider than the panel is a
 * page somebody can scroll.
 */
function packed(bars: readonly Drafted[], room: number): Drafted[][] {
  const rows: Drafted[][] = []
  let row: Drafted[] = []
  let used = HEAD_WIDTH

  for (const one of bars) {
    if (row.length > 0 && used + one.natural > room) {
      rows.push(row)
      row = []
      used = HEAD_WIDTH
    }
    row.push(one)
    used += one.natural
  }
  if (row.length > 0) {
    rows.push(row)
  }
  return rows
}
