/**
 * The score envelope.
 *
 * Only the outermost shape lives here: the version every file carries and the
 * metadata a library needs in order to list one. The musical body — the tick
 * grid, the notes, the parts, the control events, the arrangements — is Block
 * B's, and each of those tasks extends these types rather than replacing them.
 *
 * Nothing under apps/ may declare any of this. One copy of the format is the
 * whole point of the package: two copies means a day when the app accepts a
 * file the MCP server rejects, and the symptom of that is music that does not
 * play rather than an error anybody can read.
 */

import { validateNotes, type Note } from './note'
import { partsOf, validateParts, type Part } from './part'
import { resolveTiming, type ResolvedTiming, type Timing } from './time'

/**
 * Bumped only by a breaking change. PI14 adds the migration chain that reads
 * it, so that a file written against version 1 still opens years later.
 */
export const FORMAT_VERSION = 1

export type ScoreMetadata = {
  /** What the piece is called: the one field a score may not omit. */
  readonly title: string
  readonly composer?: string
}

export type Score = {
  readonly formatVersion: number
  readonly metadata: ScoreMetadata
  /**
   * Where things happen. Optional, because a score with none means the
   * defaults everyone assumes: 480 ticks to the quarter, 120 bpm, four four,
   * no pickup. Read it through timingOf rather than directly, so a score that
   * left it out and one that wrote the defaults behave identically.
   */
  readonly timing?: Timing
  /**
   * The notes, in no required order: they carry their own positions, and a
   * file that lists them by part rather than by time is as valid as one that
   * does not. Optional, so a score can be a title and a plan.
   */
  readonly notes?: readonly Note[]
  /**
   * The parts the panel lists. A score declaring none gets one implicit part,
   * so a quick melody needs no part table.
   */
  readonly parts?: readonly Part[]
}

/** The parts a score plays with, with the implicit one supplied where needed. */
export function scoreParts(score: Score): readonly Part[] {
  return partsOf(score)
}

/** The notes a score carries, with the empty case made explicit. */
export function notesOf(score: Score): readonly Note[] {
  return score.notes ?? []
}

/**
 * Everything wrong with a score's notes, as sentences.
 *
 * The full validator arrives with PI15 and covers the envelope too; this is
 * the musical half, which is the half a schema cannot express: a schema can
 * say a pitch is a number, not that two of them may not sound at once in one
 * voice.
 */
export function validateScoreNotes(score: Score): string[] {
  const notes = notesOf(score)
  return [...validateNotes(notes), ...validateParts(scoreParts(score), notes)]
}

/** The timing a score actually plays under, with every default filled in. */
export function timingOf(score: Score): ResolvedTiming {
  return resolveTiming(score.timing)
}

/**
 * How a score is named in a list, a log line or a tool result. Trivial today,
 * but it is the one piece of format behaviour both consumers share, which is
 * what keeps the seam honest before Block B fills the package out.
 */
export function describeScore(score: Score): string {
  const { title, composer } = score.metadata
  return composer === undefined ? title : `${title} — ${composer}`
}

/**
 * Whether this build can open the file at all. PI14 replaces the equality with
 * a walk through the migration chain.
 */
export function isSupportedVersion(score: Score): boolean {
  return score.formatVersion === FORMAT_VERSION
}
