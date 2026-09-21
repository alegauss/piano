import type { OpenProblem, OpenResult } from '@piano/ipc'
import { parseScore, type Score } from '@piano/score-format'

/**
 * What the window makes of an answer to "open this".
 *
 * Main read the file and validated it; what crosses the bridge is a clone of
 * what it accepted. Parsing it once more here is what gives it the score's
 * type without a cast, and it cannot disagree, because it is the same parser.
 * The window acts on an outcome in one step: an opened score replaces the
 * open one whole, and anything else leaves it exactly as it was.
 */

export type Outcome =
  | {
      readonly kind: 'opened'
      readonly name: string
      readonly score: Score
      readonly notices: readonly string[]
    }
  | {
      readonly kind: 'refused'
      readonly name: string
      readonly message: string
      readonly problems: readonly OpenProblem[]
    }
  | { readonly kind: 'none' }

export type Opened = Extract<Outcome, { kind: 'opened' }>
export type Refusal = Extract<Outcome, { kind: 'refused' }>

export function outcomeOf(result: OpenResult): Outcome {
  if (result.kind !== 'opened') {
    return result
  }
  const parsed = parseScore(result.score)
  return parsed.ok
    ? { kind: 'opened', name: result.name, score: parsed.score, notices: result.notices }
    : { kind: 'refused', name: result.name, message: parsed.message, problems: parsed.problems }
}

/** How many problems a person is shown before the rest are counted. */
export const SHOWN_PROBLEMS = 8

/**
 * One problem as a person reads it: what the file needs and what to do about
 * it. Where in the file, and what was found there, is kept apart: it is what
 * a model repairing the file wants, and in the way of somebody who is not.
 */
export type Plainly = {
  readonly needs: string
  readonly fix: string | null
  readonly where: string
  readonly found: string
}

export function plainly(problem: OpenProblem): Plainly {
  return {
    needs: problem.expected,
    fix: problem.fix ?? null,
    where: problem.path,
    found: problem.received,
  }
}
