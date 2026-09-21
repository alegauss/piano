import type { z } from 'zod'

import { withoutStaleRulesWork } from './arrangement'
import { migrate, nearestKnownKey, unknownKeys } from './migrate'
import { findOverlaps, noteProblems, pitchToSpelling, spellingToPitch, type Note } from './note'
import { formatProblems, problemFromIssue, render, type ScoreProblem } from './repair'
import { scoreSchema } from './schema'
import { notesOf, validateScoreRest, type Score } from './score'

export {
  formatProblems,
  MAX_REPORTED_PROBLEMS,
  type ProblemKind,
  type ScoreProblem,
} from './repair'

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

export type ParseResult =
  | { readonly ok: true; readonly score: Score; readonly migrated: readonly string[] }
  | { readonly ok: false; readonly problems: readonly ScoreProblem[]; readonly message: string }

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
  return error.issues.map((issue) => problemFromIssue(issue, valueAt(raw, issue.path)))
}

/**
 * A field the format does not define, pointed at by name, with the field it
 * was probably meant to be or the place anything else belongs.
 */
function unknownFieldProblems(record: Record<string, unknown>): ScoreProblem[] {
  return unknownKeys(record).map((key) => {
    const near = nearestKnownKey(key)
    return {
      kind: 'unknown field',
      path: key,
      received: 'a field the format does not define',
      expected: near === null ? 'only the fields a score defines' : `"${near}"`,
      fix:
        near === null
          ? `move "${key}" under "extensions", which keeps anything of your own`
          : `rename "${key}" to "${near}"`,
    }
  })
}

/**
 * The rules about notes that need the notes, each pointed at the note.
 *
 * Two notes of one pitch overlapping in a voice name both, the tick where they
 * collide and the two ways out; a spelling that disagrees with its pitch names
 * the spelling that would agree.
 */
function noteRuleProblems(notes: readonly Note[]): ScoreProblem[] {
  const problems: ScoreProblem[] = []
  notes.forEach((note, index) => {
    for (const problem of noteProblems(note, index)) {
      const spelled = note.spelling === undefined ? null : spellingToPitch(note.spelling)
      const spellingWrong = spelled !== null && spelled !== note.pitch
      problems.push({
        kind: 'note',
        path: spellingWrong ? `notes.${String(index)}.spelling` : `notes.${String(index)}`,
        received: spellingWrong ? render(note.spelling) : `${problem.note}`,
        expected: problem.message,
        ...(spellingWrong
          ? { fix: `use "${pitchToSpelling(note.pitch)}", or leave the spelling out` }
          : {}),
      })
    }
  })
  for (const overlap of findOverlaps(notes)) {
    problems.push({
      kind: 'overlap',
      path: `notes.${String(overlap.secondIndex)}`,
      received: `${overlap.second} starting at tick ${String(overlap.tick)}`,
      expected:
        `no overlap with ${overlap.first} (notes.${String(overlap.firstIndex)}), ` +
        `which holds pitch ${String(overlap.pitch)} in voice ${String(overlap.voice)} past that tick`,
      fix:
        `give notes.${String(overlap.firstIndex)} a duration of ` +
        `${String(overlap.tick - overlap.firstStart)} so it ends where the next one starts, ` +
        `or put one of them in another voice`,
    })
  }
  return problems
}

export function parseScore(raw: unknown): ParseResult {
  const refused = (problems: ScoreProblem[]): ParseResult => ({
    ok: false,
    problems,
    message: formatProblems(problems),
  })

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return refused([
      { kind: 'wrong type', path: '<root>', received: render(raw), expected: 'a score object' },
    ])
  }

  const record = raw as Record<string, unknown>

  // An old file is not a malformed one. Bring it forward first.
  const migrated = migrate(record)
  if (!migrated.ok) {
    return refused([
      {
        kind: 'version',
        path: 'formatVersion',
        received: render(record['formatVersion']),
        expected: migrated.reason,
      },
    ])
  }

  // Unknown keys first, because the problem names the field they probably
  // meant, which a strict-object failure does not.
  const unknown = unknownFieldProblems(migrated.score)
  if (unknown.length > 0) {
    return refused(unknown)
  }

  const parsed = scoreSchema.safeParse(migrated.score)
  if (!parsed.success) {
    return refused(fromZod(parsed.error, migrated.score))
  }

  // The rules' own untouched arrangements that name notes no longer here are
  // set aside and said so, rather than refusing a score somebody edited:
  // they can be worked out again, where a person's arrangement cannot.
  const written = parsed.data as Score
  const pruned = withoutStaleRulesWork(written.arrangements ?? [], notesOf(written))
  const score: Score =
    pruned.setAside.length === 0 ? written : { ...written, arrangements: pruned.arrangements }
  const setAside = pruned.setAside.map(
    (arrangement) =>
      `the ${arrangement.level} arrangement the rules worked out named notes this score no longer has, so it was set aside; choosing the level works it out again`,
  )

  // The musical half, which no schema can express.
  const musical = [
    ...noteRuleProblems(notesOf(score)),
    ...validateScoreRest(score).map((problem): ScoreProblem => ({
      kind: 'musical',
      path: problem.area,
      received: `the ${problem.area} as written`,
      expected: problem.message,
    })),
  ]
  if (musical.length > 0) {
    return refused(musical)
  }

  return { ok: true, score, migrated: [...migrated.applied, ...setAside] }
}
