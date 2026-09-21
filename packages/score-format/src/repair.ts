import type { z } from 'zod'

/**
 * Problems written for the thing that will read them.
 *
 * The main reader of a refusal here is not a person: it is a model about to
 * try again, and that changes what a good problem is. Each one says where the
 * trouble is as a JSON path, what arrived there, what was wanted, and — where
 * the right answer can be worked out — the correction itself, so a retry is a
 * substitution rather than another guess. A tick off the grid says which tick
 * it should be; a velocity past the top says what the top is; a level spelled
 * wrong says which level was meant.
 *
 * They are bounded as well as specific. A score with two hundred problems
 * returned in full is a repair loop that never converges: the model rewrites
 * everything, breaks something else, and gets two hundred more. So the prose
 * shows a few of each kind and counts the rest, while the full list travels
 * as data for a caller that will act on it programmatically.
 */

/** What sort of trouble a problem is, which is what the report groups by. */
export type ProblemKind =
  | 'version'
  | 'unknown field'
  | 'missing'
  | 'wrong type'
  | 'out of range'
  | 'not an option'
  | 'bad format'
  | 'overlap'
  | 'note'
  | 'musical'

export type ScoreProblem = {
  readonly kind: ProblemKind
  /** Where, as a JSON path such as notes.3.pitch. */
  readonly path: string
  /** What arrived, rendered for a message. */
  readonly received: string
  /** What was wanted instead. */
  readonly expected: string
  /** The correction, where one can be worked out rather than guessed. */
  readonly fix?: string
}

/** How many problems the prose shows before the rest are counted. */
export const MAX_REPORTED_PROBLEMS = 8

/** How many of one kind are shown, so a second kind of trouble is not buried under the first. */
export const PER_KIND = 3

/** A value as a message quotes it. */
export function render(value: unknown): string {
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

/**
 * A value that would do, for a field that is missing: an example rather than
 * a type, because an example is what gets copied correctly.
 */
const EXAMPLES: Readonly<Record<string, string>> = {
  formatVersion: '1',
  title: '"Untitled"',
  pitch: '60',
  start: '0',
  duration: '480',
  velocity: '80',
  tick: '0',
  id: '"a-short-id"',
  name: '"Piano"',
  label: '"Verse"',
  startTick: '0',
  endTick: '1920',
  level: '"beginner"',
  numerator: '4',
  denominator: '4',
  microsecondsPerQuarter: '500000',
  pedal: '"sustain"',
  value: '127',
  source: '"Composed for this score"',
  licence: '"CC0"',
}

/** A cheap edit distance, enough to catch a typo but not to guess wildly. */
function editDistance(a: string, b: string): number {
  const rows: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )

  for (let i = 0; i <= a.length; i += 1) {
    rows[i]![0] = i
  }
  for (let j = 0; j <= b.length; j += 1) {
    rows[0]![j] = j
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      rows[i]![j] = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + cost,
      )
    }
  }

  return rows[a.length]![b.length]!
}

/**
 * The option a mistyped value probably meant, or null when it is a different
 * word: beyond a few edits it is not a typo, and a fix that guesses is worse
 * than none.
 */
export function nearestOption(value: string, options: readonly string[]): string | null {
  let best: string | null = null
  let distance = Number.POSITIVE_INFINITY
  for (const option of options) {
    const next = editDistance(value.toLowerCase(), option.toLowerCase())
    if (next < distance) {
      distance = next
      best = option
    }
  }
  return distance <= 3 ? best : null
}

/**
 * One schema issue, turned into a problem a retry can act on.
 *
 * The fix is offered only where it is the answer and not a guess: the nearest
 * whole tick, the bound a value went past, the option a typo was one letter
 * from, a number that arrived in quotes. Where nothing can be worked out the
 * problem says what was expected and stops there.
 */
export function problemFromIssue(issue: z.core.$ZodIssue, value: unknown): ScoreProblem {
  const at = {
    path: issue.path.length > 0 ? issue.path.join('.') : '<root>',
    received: render(value),
  }
  switch (issue.code) {
    case 'invalid_type':
      return typeProblem(at, String(issue.path.at(-1) ?? ''), issue.expected, value)
    case 'too_small':
      return rangeProblem(at, issue.message, value, Number(issue.minimum), issue.inclusive, 1)
    case 'too_big':
      return rangeProblem(at, issue.message, value, Number(issue.maximum), issue.inclusive, -1)
    case 'invalid_value':
      return optionProblem(at, issue.values.map(String), value)
    case 'invalid_format':
      return { kind: 'bad format', ...at, expected: issue.message }
    default:
      return { kind: 'wrong type', ...at, expected: issue.message }
  }
}

type Where = { readonly path: string; readonly received: string }

/** Nothing there, a number off the grid, a number in quotes, or simply the wrong thing. */
function typeProblem(at: Where, field: string, expected: string, value: unknown): ScoreProblem {
  if (value === undefined) {
    const example = EXAMPLES[field]
    return {
      kind: 'missing',
      ...at,
      expected: `a value for "${field}"`,
      ...(example === undefined ? {} : { fix: `add "${field}": ${example}` }),
    }
  }
  if (expected === 'int' && typeof value === 'number') {
    return {
      kind: 'out of range',
      ...at,
      expected: 'a whole number',
      fix: `use ${String(Math.round(value))}`,
    }
  }
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  if (expected === 'number' && Number.isFinite(number)) {
    return {
      kind: 'wrong type',
      ...at,
      expected: 'a number',
      fix: `use ${String(number)}, without quotes`,
    }
  }
  return { kind: 'wrong type', ...at, expected }
}

/** Past a bound: the fix is the bound, or the first value inside it when the bound is exclusive. */
function rangeProblem(
  at: Where,
  expected: string,
  value: unknown,
  bound: number,
  inclusive: boolean | undefined,
  inward: 1 | -1,
): ScoreProblem {
  const fits = inclusive === false ? bound + inward : bound
  const fixable = typeof value === 'number' && Number.isFinite(fits)
  return {
    kind: 'out of range',
    ...at,
    expected,
    ...(fixable ? { fix: `use ${String(fits)}` } : {}),
  }
}

/** Not one of the options: named in full, with the one a typo was probably aiming at. */
function optionProblem(at: Where, options: readonly string[], value: unknown): ScoreProblem {
  const near = typeof value === 'string' ? nearestOption(value, options) : null
  return {
    kind: 'not an option',
    ...at,
    expected: `one of ${options.join(', ')}`,
    ...(near === null ? {} : { fix: `use "${near}"` }),
  }
}

/** What the prose needs of a problem, which a warning has too. */
type Reported = Pick<ScoreProblem, 'path' | 'received' | 'expected' | 'fix'> & {
  readonly kind: string
}

function line(problem: Reported): string {
  const said = `${problem.path}: expected ${problem.expected}, received ${problem.received}`
  return problem.fix === undefined ? said : `${said}; fix: ${problem.fix}`
}

/**
 * The prose half: a few of each kind, then the rest counted by kind.
 *
 * Grouped so that the first kind of trouble cannot bury the second — two
 * hundred misspelled pitches and one missing title show three pitches and the
 * title, not eight pitches — and bounded, so the reply always fits in a
 * turn the model can act on. Warnings are told the same way, as warnings.
 */
export function formatProblems(problems: readonly Reported[], noun = 'problems'): string {
  const kinds = new Map<string, Reported[]>()
  for (const problem of problems) {
    kinds.set(problem.kind, [...(kinds.get(problem.kind) ?? []), problem])
  }

  const lines: string[] = []
  const hidden = new Map<string, number>()
  for (const [kind, ofKind] of kinds) {
    const room = Math.max(0, Math.min(PER_KIND, MAX_REPORTED_PROBLEMS - lines.length))
    for (const problem of ofKind.slice(0, room)) {
      lines.push(line(problem))
    }
    if (ofKind.length > room) {
      hidden.set(kind, ofKind.length - room)
    }
  }

  if (hidden.size > 0) {
    const count = [...hidden.values()].reduce((sum, one) => sum + one, 0)
    const which = [...hidden].map(([kind, one]) => `${String(one)} ${kind}`).join(', ')
    const counted =
      count === 1
        ? `1 more ${noun.replace(/s$/, '')} like this`
        : `${String(count)} more ${noun} like these`
    lines.push(`and ${counted} (${which})`)
  }
  return lines.join('\n')
}
