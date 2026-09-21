import { noteEnd, type Hand, type Note, type ResolvedTiming } from '@piano/score-format'

import { beamGroup, keySignature, type SheetPlan } from './sheet'

/**
 * What on the page came from the score, and what came from reading it.
 *
 * Engraving reads as fact, and that is the problem this answers: a stave drawn
 * from inference looks exactly like a stave drawn from a manuscript. The format
 * carries no clefs, no key changes, no ties, no beams and no rests, so a page
 * of them is full of decisions somebody should be able to see.
 *
 * MIDI export already answers this shape of problem honestly — the export
 * response carries what the file could not hold and describeExport turns it
 * into a sentence — so this is the same move: plain sentences about the piece,
 * said once rather than once a bar, and only the ones that actually apply.
 *
 * Each names the reading rather than the field. "There is no key signature
 * because metadata.key is absent" is about this codebase; "no key signature:
 * the score names no key" is about the page in front of somebody.
 */

/** Which hands the score names at all. */
function handsOf(notes: readonly Note[]): Hand[] {
  return (['right', 'left'] as const).filter((hand) => notes.some((note) => note.hand === hand))
}

/**
 * Whether a hand holds a note that was still sounding when it struck again.
 *
 * That note keeps the figure it opened and the later one gets its own, which
 * is one line where the music has two. Worth saying, because the page then
 * shows fewer figures than the score holds.
 */
function holdsUnder(notes: readonly Note[], hand: Hand): boolean {
  const line = notes
    .filter((note) => note.hand === hand)
    .sort((one, other) => one.start - other.start)
  let sounding = 0
  for (const note of line) {
    if (note.start > 0 && note.start < sounding) {
      return true
    }
    sounding = Math.max(sounding, noteEnd(note))
  }
  return false
}

/** Every figure on the page, in reading order. */
function figures(plan: SheetPlan) {
  return plan.systems.flatMap((system) =>
    system.bars.flatMap((bar) => bar.staves.flatMap((stave) => stave.notes)),
  )
}

/**
 * How many notes are held across a barline.
 *
 * A figure showing a note that began before it is the far end of one: counted
 * by the note rather than by the figure, since one long note may cross several
 * lines and it is still one note a reader is owed the truth about.
 */
function crossings(plan: SheetPlan): number {
  const held = new Set<string>()
  for (const one of figures(plan)) {
    for (const note of one.shows) {
      if (note.start < one.start) {
        held.add(`${String(note.start)}:${String(note.pitch)}`)
      }
    }
  }
  return held.size
}

/** The meters on this page that no beam group fits, each named once. */
function unbeamed(plan: SheetPlan): string[] {
  const meters = plan.systems
    .flatMap((system) => system.bars)
    .filter((bar) => beamGroup(bar.signature) === null)
    .map((bar) => `${String(bar.signature.numerator)}/${String(bar.signature.denominator)}`)
  return [...new Set(meters)]
}

const plural = (many: number, one: string, more: string) => (many === 1 ? one : more)

export type ReadingsInput = {
  readonly timing: ResolvedTiming
  /** The notes the page was drawn from, already filtered as the panel filters them. */
  readonly notes: readonly Note[]
  readonly key?: string
  readonly plan: SheetPlan
}

/** Every inference this page actually made, as sentences for a reader. */
export function readings({ notes, key, plan }: ReadingsInput): string[] {
  if (plan.systems.length === 0) {
    return []
  }
  const said: string[] = []
  const hands = handsOf(notes)

  // Clefs. The format has none, so the hand a note names is the whole of it,
  // and note.ts is explicit that a hand is not the same question as a part.
  if (hands.length === 2) {
    said.push('The treble stave is the right hand and the bass the left: the score has no clefs.')
  } else if (hands.length === 1) {
    said.push(
      `Everything is on one ${hands[0] === 'right' ? 'treble' : 'bass'} stave, from the one hand the score names; it has no clefs.`,
    )
  } else {
    said.push('Everything is on one treble stave: the score names neither hands nor clefs.')
  }

  // The key signature, which is one string for the whole piece or nothing.
  const signature = keySignature(key)
  if (signature !== undefined) {
    said.push(
      `The key signature is ${signature}, taken from the score's key and held for the whole piece: nothing here records a key change.`,
    )
  } else if (key !== undefined && key.trim() !== '') {
    said.push(`No key signature: the score's key, "${key.trim()}", is not one a signature spells.`)
  } else {
    said.push('No key signature: the score names no key.')
  }

  // Accidentals: the spelling where the score wrote one, and sharps upward
  // where it did not, which is a guess about the music rather than the pitch.
  const unspelled = notes.filter((note) => note.spelling === undefined).length
  if (unspelled === notes.length && notes.length > 0) {
    said.push('Every accidental is a sharp: the score spells no note, so the reading went upward.')
  } else if (unspelled > 0) {
    said.push(
      `${String(unspelled)} ${plural(unspelled, 'note is', 'notes are')} spelled with sharps here, having no spelling of ${plural(unspelled, 'its', 'their')} own.`,
    )
  } else {
    said.push('Accidentals are the ones the score spelled out.')
  }

  // Rests, which this format does not have: every one on the page is a gap.
  const rests = figures(plan).filter((one) => one.rest).length
  if (rests > 0) {
    said.push(
      `${String(rests)} ${plural(rests, 'rest', 'rests')} ${plural(rests, 'is', 'are')} a gap in the score rather than a rest somebody wrote, including any bar that does not add up.`,
    )
  }

  // A note held across a barline. barFigures clips it at the line and shows
  // its far end again in the next bar, and the format has no tie to mark the
  // two as one note, so the page reads as two notes struck.
  const tied = crossings(plan)
  if (tied > 0) {
    said.push(
      `${String(tied)} ${plural(tied, 'note', 'notes')} ${plural(tied, 'crosses', 'cross')} a barline and ${plural(tied, 'is', 'are')} drawn as two figures with no tie between them: the score has no ties.`,
    )
  }

  // A figure no note value spells exactly, which a triplet is.
  if (plan.leftovers > 0) {
    said.push(
      `${String(plan.leftovers)} ${plural(plan.leftovers, 'figure', 'figures')} ${plural(plan.leftovers, 'is', 'are')} the nearest note value to what the score holds, the remainder rounded away: a triplet reads this way.`,
    )
  }

  // A meter whose beat no denominator settles, so nothing was beamed. Said
  // because a page of loose flags otherwise looks like an oversight.
  const odd = unbeamed(plan)
  if (odd.length > 0) {
    said.push(
      `Nothing in ${odd.join(' or ')} is beamed: the beat of that meter is a decision the score does not record, and flags claim less than the wrong grouping would.`,
    )
  }

  // One line per hand, where the music has more.
  const crowded = hands.filter((hand) => holdsUnder(notes, hand))
  if (crowded.length > 0) {
    said.push(
      `The ${crowded.join(' and ')} ${plural(crowded.length, 'hand holds', 'hands hold')} notes under other notes, and one stave shows one line: the held ${plural(crowded.length, 'note', 'notes')} keeps no figure of its own.`,
    )
  }

  return said
}
