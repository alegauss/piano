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
