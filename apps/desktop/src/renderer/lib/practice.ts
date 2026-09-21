import { CHORD_TICKS, noteAudible, type Note, type PlaybackFilter } from '@piano/score-format'

/**
 * What the player owes next, and whether they have played it.
 *
 * This is the one notion of a correct note in the app. Wait mode asks it
 * what to stop for and when to carry on; the grader asks it the same
 * question about the same notes. Two answers to "was that right" would be
 * two apps.
 *
 * A chord is a group rather than a sequence: notes within a short window of
 * each other in the score are owed together, and a player pressing them a
 * few milliseconds apart has played the chord.
 */

/**
 * How close in the score two notes must be to count as one chord. The
 * format's own figure: what counts as a chord is a question about the score,
 * and the reduction rules ask it too.
 */
export { CHORD_TICKS }

export type Expectation = {
  /** The tick the group starts at, which is where playback waits. */
  readonly tick: number
  readonly pitches: readonly number[]
}

/**
 * Whose notes the player owes.
 *
 * The parts panel already says who plays what: a part the app has been told
 * not to sound is a part somebody is playing themselves, so that is what
 * wait mode waits for and the rest is accompaniment. With nothing silenced
 * the player owes the whole piece, which is the plain case of playing along.
 */
export function playerNotes(notes: readonly Note[], filter: PlaybackFilter = {}): Note[] {
  const silenced = notes.filter((note) => !noteAudible(note, filter))
  return silenced.length > 0 ? silenced : [...notes]
}

/** The next group at or after a tick, or null once the piece is over. */
export function nextExpectation(
  notes: readonly Note[],
  fromTick: number,
  chordTicks: number = CHORD_TICKS,
): Expectation | null {
  let tick: number | null = null
  for (const note of notes) {
    if (note.start >= fromTick && (tick === null || note.start < tick)) {
      tick = note.start
    }
  }
  if (tick === null) {
    return null
  }
  const pitches = new Set<number>()
  for (const note of notes) {
    if (note.start >= tick && note.start <= tick + chordTicks) {
      pitches.add(note.pitch)
    }
  }
  return { tick, pitches: [...pitches].sort((one, other) => one - other) }
}

/**
 * Whether a group has been played.
 *
 * Extra notes are not consulted. A beginner trying a note to find out where
 * it is has not committed an error, and blocking on it would punish the
 * exploring that practice is made of.
 */
export function satisfied(expectation: Expectation, struck: ReadonlySet<number>): boolean {
  return expectation.pitches.every((pitch) => struck.has(pitch))
}

/** The pitches of a group still outstanding, which is what the keyboard lights up. */
export function outstanding(
  expectation: Expectation,
  struck: ReadonlySet<number>,
): readonly number[] {
  return expectation.pitches.filter((pitch) => !struck.has(pitch))
}

/** Notes played while waiting that the group did not ask for. */
export function extras(expectation: Expectation, struck: ReadonlySet<number>): readonly number[] {
  return [...struck].filter((pitch) => !expectation.pitches.includes(pitch)).sort((a, b) => a - b)
}

/**
 * Where playback carries on from once a group has been played.
 *
 * With an accompaniment, it resumes on the group's own tick: the player's
 * notes are the silenced ones, so the app will not restrike them, and
 * anything else written at that tick — the left hand under a right-hand
 * chord — still sounds where it should. With nothing silenced the player
 * owes everything, so it resumes just past the tick instead, because
 * replaying the notes somebody has just played is the one thing that makes
 * wait mode feel broken.
 */
export function resumeTick(expectation: Expectation, accompanied: boolean): number {
  return accompanied ? expectation.tick : expectation.tick + 1
}
