import { FORMAT_VERSION } from './version'

/**
 * How a file written last month keeps opening.
 *
 * A format used by a model writing files on demand will change. The choice is
 * between one reader that branches on every version, which nobody dares touch
 * after the third branch, and a chain of small steps each of which does one
 * thing. This is the chain: version 1 to 2, 2 to 3, and so on, each
 * individually testable, walked in order at load.
 *
 * Migrations run one way by design. Writing is always at the current version,
 * because a format that can also write old versions has twice the surface and
 * no one asked for it.
 */

/** One step, from a version to the one after it. */
export type Migration = {
  readonly from: number
  readonly describe: string
  readonly apply: (score: Record<string, unknown>) => Record<string, unknown>
}

/**
 * The chain, in order.
 *
 * Empty because nothing has broken yet. The first entry arrives with the first
 * breaking change, and the frozen fixture for the version it migrates from
 * arrives with it: a migration tested against a file that was edited to suit
 * it proves nothing.
 */
export const MIGRATIONS: readonly Migration[] = []

export type MigrationResult =
  | {
      readonly ok: true
      readonly score: Record<string, unknown>
      readonly applied: readonly string[]
    }
  | { readonly ok: false; readonly reason: string }

/**
 * Walk a parsed file up to the current version.
 *
 * Refuses a version from the future by name: an app cannot invent the
 * transformation that has not been written yet, and opening the file anyway
 * would mean reading fields whose meaning changed underneath it.
 */
export function migrate(raw: Record<string, unknown>): MigrationResult {
  const declared = raw['formatVersion']

  if (typeof declared !== 'number' || !Number.isInteger(declared)) {
    return {
      ok: false,
      reason: `formatVersion is ${JSON.stringify(declared)}; every score declares it as a whole number, and ${String(FORMAT_VERSION)} is current`,
    }
  }

  if (declared > FORMAT_VERSION) {
    return {
      ok: false,
      reason: `this score is format version ${String(declared)} and this build reads up to ${String(FORMAT_VERSION)}; update the app rather than the file`,
    }
  }

  let score = raw
  let version = declared
  const applied: string[] = []

  while (version < FORMAT_VERSION) {
    const step = MIGRATIONS.find((migration) => migration.from === version)
    if (step === undefined) {
      return {
        ok: false,
        reason: `no migration exists from format version ${String(version)} to ${String(version + 1)}`,
      }
    }
    score = step.apply(score)
    applied.push(step.describe)
    version += 1
  }

  return { ok: true, score: { ...score, formatVersion: FORMAT_VERSION }, applied }
}

/**
 * The reserved namespace.
 *
 * Somewhere to put a field without proposing a format change: a fingering
 * study, an editor's own notes, a experiment nobody else should have to know
 * about. Namespaced by owner so two experiments do not collide, and preserved
 * across a round trip rather than dropped.
 *
 * Unknown keys *outside* this object are an error rather than a warning.
 * Silently ignoring a misspelled field is how a model learns to emit something
 * that does nothing at all, and then keeps doing it.
 */
export type Extensions = Readonly<Record<string, unknown>>

/** The keys the format itself defines, which is what "unknown" is measured against. */
export const KNOWN_SCORE_KEYS = [
  'formatVersion',
  'metadata',
  'timing',
  'notes',
  'parts',
  'expression',
  'sections',
  'arrangements',
  'extensions',
] as const

export function unknownKeys(raw: Record<string, unknown>): string[] {
  const known = new Set<string>(KNOWN_SCORE_KEYS)
  return Object.keys(raw).filter((key) => !known.has(key))
}

/**
 * Report a misspelled field, with the nearest real one where there is a clear
 * candidate. The next reader is usually a model repairing its own output, and
 * "unknown key" alone does not tell it what to write instead.
 */
export function unknownKeyProblems(raw: Record<string, unknown>): string[] {
  return unknownKeys(raw).map((key) => {
    const near = nearestKey(key)
    const suggestion = near === null ? '' : `; did you mean "${near}"?`
    return `"${key}" is not a field of a score${suggestion} Anything the format does not define goes under "extensions".`
  })
}

/** A cheap edit distance, enough to catch a typo but not to guess wildly. */
function nearestKey(key: string): string | null {
  let best: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const candidate of KNOWN_SCORE_KEYS) {
    const distance = editDistance(key.toLowerCase(), candidate.toLowerCase())
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }

  // Beyond a couple of edits it is a different word, not a typo.
  return bestDistance <= 3 ? best : null
}

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
