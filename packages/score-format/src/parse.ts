import type { z } from 'zod'

import { migrate, unknownKeyProblems } from './migrate'
import { scoreSchema } from './schema'
import { validateScoreNotes, type Score } from './score'

/**
 * The one door a score comes through.
 *
 * Three callers use it: the app opening a file, the MCP server receiving one
 * from Claude Code, and the tests. All three run this code, so a file the tool
 * accepts is a file the app opens, with no third behaviour hiding between them.
 *
 * Order matters. Migrate first, because an old file is not malformed, it is
 * old. Then the schema, which answers the structural questions. Then the
 * musical rules, which a schema cannot express.
 */

export type ScoreProblem = {
  /** Where, as a JSON path such as notes.3.pitch. */
  readonly path: string
  /** What arrived, rendered for a message. */
  readonly received: string
  /** What was wanted instead. */
  readonly expected: string
}

export type ParseResult =
  | { readonly ok: true; readonly score: Score; readonly migrated: readonly string[] }
  | { readonly ok: false; readonly problems: readonly ScoreProblem[]; readonly message: string }

/**
 * How many problems a caller is shown before the rest are counted.
 *
 * A score with two hundred problems returned in full is a repair loop that
 * never converges: the model rewrites everything, breaks something else, and
 * gets another two hundred. A handful, grouped, is actionable.
 */
export const MAX_REPORTED_PROBLEMS = 8

function render(value: unknown): string {
  if (value === undefined) {
    return 'nothing'
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'object' && value !== null) {
    return Array.isArray(value) ? `an array of ${String(value.length)}` : 'an object'
  }
  // Primitives only by this point: objects, arrays, strings and undefined are
  // all handled above, so there is no default stringification to fall into.
  return JSON.stringify(value) ?? 'nothing'
}

/** Pull the value at a JSON path out of the input, so the message can quote it. */
function valueAt(root: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = root
  for (const key of path) {
    if (current === null || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<PropertyKey, unknown>)[key]
  }
  return current
}

function fromZod(error: z.ZodError, raw: unknown): ScoreProblem[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '<root>',
    received: render(valueAt(raw, issue.path)),
    expected: issue.message,
  }))
}

/** One line per problem, in the shape a model can act on directly. */
export function formatProblems(problems: readonly ScoreProblem[]): string {
  const shown = problems.slice(0, MAX_REPORTED_PROBLEMS)
  const lines = shown.map(
    (problem) => `${problem.path}: expected ${problem.expected}, received ${problem.received}`,
  )
  if (problems.length > shown.length) {
    lines.push(`and ${String(problems.length - shown.length)} more problems of the same kind`)
  }
  return lines.join('\n')
}

export function parseScore(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    const problems: ScoreProblem[] = [
      { path: '<root>', received: render(raw), expected: 'a score object' },
    ]
    return { ok: false, problems, message: formatProblems(problems) }
  }

  const record = raw as Record<string, unknown>

  // An old file is not a malformed one. Bring it forward first.
  const migrated = migrate(record)
  if (!migrated.ok) {
    const problems: ScoreProblem[] = [
      {
        path: 'formatVersion',
        received: render(record['formatVersion']),
        expected: migrated.reason,
      },
    ]
    return { ok: false, problems, message: formatProblems(problems) }
  }

  // Unknown keys first, because the message names the field they probably
  // meant, which a strict-object failure does not.
  const unknown = unknownKeyProblems(migrated.score)
  if (unknown.length > 0) {
    const problems: ScoreProblem[] = unknown.map((message) => ({
      path: '<root>',
      received: 'an unrecognised field',
      expected: message,
    }))
    return { ok: false, problems, message: formatProblems(problems) }
  }

  const parsed = scoreSchema.safeParse(migrated.score)
  if (!parsed.success) {
    const problems = fromZod(parsed.error, migrated.score)
    return { ok: false, problems, message: formatProblems(problems) }
  }

  const score = parsed.data as Score

  // The musical half, which no schema can express.
  const musical = validateScoreNotes(score)
  if (musical.length > 0) {
    const problems: ScoreProblem[] = musical.map((message) => ({
      path: 'notes',
      received: 'the notes as written',
      expected: message,
    }))
    return { ok: false, problems, message: formatProblems(problems) }
  }

  return { ok: true, score, migrated: migrated.applied }
}
