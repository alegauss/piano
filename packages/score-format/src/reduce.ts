import type { Arrangement, Level } from './arrangement'
import { noteEnd, voiceOf, type Note } from './note'
import { partOf, partsOf, type Part, type PartRole } from './part'
import { notesOf, timingOf, type Score } from './score'
import { beatTicks, meterAt, type ResolvedTiming } from './time'

/**
 * The simple version of a piece, worked out rather than written by hand.
 *
 * The format allows three arrangements per score, and writing three by hand
 * for every piece is a cost that quietly stops being paid: then beginner mode
 * works for the handful of scores somebody curated and for nothing else. So
 * the reduction is derived, and a hand-authored arrangement still wins over it
 * wherever one exists.
 *
 * Five rules, applied in order, each one separately answerable: keep the top
 * voices, take a chord down to its outer two notes, drop ornaments and grace
 * notes, thin a repeated accompaniment figure to one note per beat, and fold a
 * chord nobody can reach into its bass note. The failure mode worth guarding
 * against is not a reduction that is too hard, it is one that is technically
 * simpler and musically unrecognisable, which is why every rule only ever
 * takes notes away and never moves or rewrites one.
 *
 * That is also what makes the result reviewable: what comes out is a subset of
 * what went in, so it can be written down as an arrangement naming the notes
 * it left out, and corrected by hand afterwards. Reduction never edits the
 * source notes.
 */

/** How close two notes must start to count as one chord, in ticks. */
export const CHORD_TICKS = 30

/** Wider than this and a chord is not a hand position; it is two. */
export const REACH_SEMITONES = 12

/** Shorter than a beat over this, and a note beside a much longer one, is an ornament. */
export const ORNAMENT_PART = 8

/** How much longer its neighbour must be for a short note to be an ornament rather than fast. */
export const ORNAMENT_RATIO = 4

/** More onsets than this in one beat of an accompaniment is a figure rather than music. */
export const FIGURE_ONSETS = 2

/** What a level asks of a simpler version of a score. */
export type Reduction = {
  /** How many voices are kept in each hand, the top one first. Null keeps what the score wrote. */
  readonly voices: number | null
  readonly ornaments: boolean
  /** Whether chords come down towards a root and one interval. */
  readonly chords: 'as written' | 'simplified'
}

/** The reduction that changes nothing, which is what advanced asks for. */
export const KEEP_EVERYTHING: Reduction = {
  voices: null,
  ornaments: true,
  chords: 'as written',
}

/** Which rule took a note out, so a proposal can be read rather than trusted. */
export type Rule = 'voices' | 'chords' | 'ornaments' | 'figures' | 'reach'

export type Cut = {
  readonly rule: Rule
  readonly dropped: number
}

export type Reduced = {
  /** The piece as the level would have it, a subset of what was written. */
  readonly notes: readonly Note[]
  /**
   * The same reduction written down, for storing in the score and correcting
   * by hand. Null where a note it takes out has no id to name it by, which is
   * the one thing that stops a proposal being reviewable.
   */
  readonly arrangement: Arrangement | null
  /** What each rule took, in the order the rules ran. */
  readonly cuts: readonly Cut[]
  /** Notes it had to take out without being able to name them. */
  readonly anonymous: number
}

/** Which parts are accompaniment, which is what the thinning rules reduce by. */
export type Roles = ReadonlyMap<string, PartRole | undefined>

export function rolesOf(parts: readonly Part[]): Roles {
  return new Map(parts.map((part) => [part.id, part.role]))
}

/**
 * Whether a note is accompaniment rather than the tune.
 *
 * The part table answers it where a score fills the role in. Where it does
 * not, the left hand is the convention, and a convention that is right most of
 * the time beats thinning a melody because nobody labelled it.
 */
export function accompanies(note: Note, roles: Roles): boolean {
  const role = roles.get(partOf(note))
  if (role === 'melody') {
    return false
  }
  if (role === 'accompaniment' || role === 'bass') {
    return true
  }
  return note.hand === 'left'
}

/** Which hand a note is in, with "neither" made a group of its own. */
function handOf(note: Note): string {
  return note.hand ?? 'none'
}

/**
 * Notes that sound together in one hand, in tick order.
 *
 * A chord is a hand position rather than a set of simultaneous notes: what the
 * left hand is holding while the right plays a melody is two chords, not one.
 */
export function chordsOf(notes: readonly Note[], within: number = CHORD_TICKS): Note[][] {
  const groups: Note[][] = []
  const open = new Map<string, Note[]>()
  for (const note of [...notes].sort((one, other) => one.start - other.start)) {
    const hand = handOf(note)
    const group = open.get(hand)
    const first = group?.[0]
    if (group !== undefined && first !== undefined && note.start - first.start <= within) {
      group.push(note)
      continue
    }
    const started = [note]
    open.set(hand, started)
    groups.push(started)
  }
  return groups
}

/**
 * Keep the top voices of each hand.
 *
 * Per hand, because keeping one voice across the piece would delete the left
 * hand outright and leave a beginner playing to silence. Voices are ranked by
 * how high they sit rather than by their number, since a number is a label the
 * author chose and pitch is what a listener hears as the tune; where two sit
 * equally high the lower number wins, which is the convention for the top part.
 */
export function keepTopVoices(notes: readonly Note[], keep: number | null): Note[] {
  if (keep === null) {
    return [...notes]
  }
  const hands = new Map<string, Map<number, Note[]>>()
  for (const note of notes) {
    const hand = hands.get(handOf(note)) ?? new Map<number, Note[]>()
    hands.set(handOf(note), hand)
    const voice = hand.get(voiceOf(note)) ?? []
    hand.set(voiceOf(note), voice)
    voice.push(note)
  }

  const kept = new Set<Note>()
  for (const voices of hands.values()) {
    const ranked = [...voices.entries()]
      .map(([voice, held]) => ({
        voice,
        held,
        height: held.reduce((sum, note) => sum + note.pitch, 0) / held.length,
      }))
      .sort((one, other) => other.height - one.height || one.voice - other.voice)
    for (const voice of ranked.slice(0, Math.max(1, keep))) {
      for (const note of voice.held) {
        kept.add(note)
      }
    }
  }
  return notes.filter((note) => kept.has(note))
}

/**
 * A chord down to its outer two notes: the bass it stands on and the note on
 * top, which between them are the harmony and the tune. What goes is the
 * filling, which is what a player with five fingers and a week of practice
 * drops anyway.
 */
export function thinChords(notes: readonly Note[], within: number = CHORD_TICKS): Note[] {
  const kept = new Set<Note>()
  for (const chord of chordsOf(notes, within)) {
    if (chord.length <= 2) {
      for (const note of chord) {
        kept.add(note)
      }
      continue
    }
    const byPitch = [...chord].sort((one, other) => one.pitch - other.pitch)
    const lowest = byPitch[0]
    const highest = byPitch.at(-1)
    if (lowest !== undefined) {
      kept.add(lowest)
    }
    if (highest !== undefined) {
      kept.add(highest)
    }
  }
  return notes.filter((note) => kept.has(note))
}

/**
 * Ornaments and grace notes.
 *
 * Short is not enough on its own: a piece written in semiquavers is not an
 * ornament from beginning to end. What makes one is being short *beside*
 * something much longer in the same hand, which is exactly the shape of a
 * grace note leaning on the note it decorates.
 */
export function dropOrnaments(notes: readonly Note[], timing: ResolvedTiming): Note[] {
  const short = timing.ticksPerQuarter / ORNAMENT_PART
  return notes.filter((note) => {
    if (note.duration >= short) {
      return true
    }
    const near = notes.some(
      (other) =>
        other !== note &&
        handOf(other) === handOf(note) &&
        other.duration >= note.duration * ORNAMENT_RATIO &&
        other.start - short <= noteEnd(note) &&
        noteEnd(other) + short >= note.start,
    )
    return !near
  })
}

/**
 * A repeated accompaniment figure down to one note per beat.
 *
 * An Alberti bass is four notes a beat saying one thing, and at two thirds
 * tempo it is four times the work for none of the music. Only where a beat
 * holds more than two separate attacks: two quavers are a rhythm somebody
 * wrote, where five is a texture. The melody is never thinned.
 */
export function thinFigures(notes: readonly Note[], timing: ResolvedTiming, roles: Roles): Note[] {
  const groups = new Map<string, Note[]>()
  for (const note of notes) {
    if (!accompanies(note, roles)) {
      continue
    }
    const beat = beatTicks(meterAt(timing, note.start), timing.ticksPerQuarter)
    // From the pickup rather than from tick zero, so a piece that starts
    // half a bar in counts its beats where a player does.
    const key = `${handOf(note)}:${String(Math.floor((note.start - timing.pickupTicks) / beat))}`
    const held = groups.get(key) ?? []
    groups.set(key, held)
    held.push(note)
  }

  const dropped = new Set<Note>()
  for (const held of groups.values()) {
    const onsets = [...new Set(held.map((note) => note.start))].sort((one, other) => one - other)
    if (onsets.length <= FIGURE_ONSETS) {
      continue
    }
    const first = onsets[0]
    for (const note of held) {
      if (note.start !== first) {
        dropped.add(note)
      }
    }
  }
  return notes.filter((note) => !dropped.has(note))
}

/**
 * A chord wider than a hand, folded onto its bass note.
 *
 * A tenth in the left hand is a stretch most people do not have, and the note
 * that carries the harmony is the bottom one. Applied to accompaniment alone:
 * folding a melody onto its lowest note would take the tune away.
 */
export function foldWideChords(
  notes: readonly Note[],
  roles: Roles,
  reach: number = REACH_SEMITONES,
  within: number = CHORD_TICKS,
): Note[] {
  const dropped = new Set<Note>()
  for (const chord of chordsOf(notes, within)) {
    if (chord.length < 2 || !chord.every((note) => accompanies(note, roles))) {
      continue
    }
    const pitches = chord.map((note) => note.pitch)
    if (Math.max(...pitches) - Math.min(...pitches) <= reach) {
      continue
    }
    const bass = Math.min(...pitches)
    for (const note of chord) {
      if (note.pitch !== bass) {
        dropped.add(note)
      }
    }
  }
  return notes.filter((note) => !dropped.has(note))
}

/**
 * The whole pipeline, and what each rule took.
 *
 * The order is the order of the rules as they are written: voices first,
 * because everything after it costs less once the inner parts are gone, and
 * the reach rule last, because it is the one that judges what is left.
 */
export function reduceNotes(
  notes: readonly Note[],
  timing: ResolvedTiming,
  roles: Roles,
  wants: Reduction,
): { readonly notes: readonly Note[]; readonly cuts: readonly Cut[] } {
  const cuts: Cut[] = []
  let kept: readonly Note[] = notes

  const apply = (rule: Rule, next: readonly Note[]) => {
    if (next.length !== kept.length) {
      cuts.push({ rule, dropped: kept.length - next.length })
    }
    kept = next
  }

  apply('voices', keepTopVoices(kept, wants.voices))
  if (wants.chords === 'simplified') {
    apply('chords', thinChords(kept))
  }
  if (!wants.ornaments) {
    apply('ornaments', dropOrnaments(kept, timing))
  }
  if (wants.chords === 'simplified') {
    apply('figures', thinFigures(kept, timing, roles))
    apply('reach', foldWideChords(kept, roles))
  }
  return { notes: kept, cuts }
}

/**
 * The reduction as an arrangement, or null where it cannot be written down.
 *
 * Every rule only removes, so the arrangement is a list of notes left out and
 * nothing else: no overrides, because nothing was rewritten. A note it has to
 * drop without an id is what makes the whole proposal unstorable, since an
 * arrangement that cannot name a note cannot be corrected later either.
 */
export function arrangementOf(
  source: readonly Note[],
  kept: readonly Note[],
  level: Level,
  label = 'Generated',
): { readonly arrangement: Arrangement | null; readonly anonymous: number } {
  const surviving = new Set(kept)
  const drop: string[] = []
  let anonymous = 0
  for (const note of source) {
    if (surviving.has(note)) {
      continue
    }
    if (note.id === undefined) {
      anonymous += 1
      continue
    }
    drop.push(note.id)
  }
  if (anonymous > 0) {
    return { arrangement: null, anonymous }
  }
  return {
    arrangement: { id: `generated-${level}`, level, label, drop },
    anonymous: 0,
  }
}

/**
 * The simple version of a score at a level.
 *
 * It states no tempo of its own: how fast a level is played is the level's
 * business, and an arrangement claiming a tempo it was never told would be
 * the app putting words in the score's mouth.
 */
export function reduceScore(score: Score, level: Level, wants: Reduction): Reduced {
  const source = notesOf(score)
  const { notes, cuts } = reduceNotes(source, timingOf(score), rolesOf(partsOf(score)), wants)
  const { arrangement, anonymous } = arrangementOf(source, notes, level)
  return { notes, arrangement, cuts, anonymous }
}
