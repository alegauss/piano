import { checksum, type Level, type Score, type Section } from '@piano/score-format'

import type { Transport } from '../audio'
import type { Grader } from './grader'
import { barNames, faults, type Attempt, type Tally } from './grading'

/**
 * What still fails, remembered between sessions.
 *
 * Without history every session starts from zero, and the app cannot answer
 * the only question a learner actually has, which is what to work on today.
 * So every graded attempt leaves a record, and the useful output of them is
 * not a chart: it is a sentence naming four bars.
 *
 * Records are kept against the score's own id and the section's, never
 * against a file path or a title, so a piece that is re-saved, renamed or
 * corrected keeps the weeks of practice somebody put into it. What a
 * correction does change is the notes those records were made against, and
 * that is said out loud rather than papered over: the fingerprint of the
 * notes travels with each record, and a summary drawn from records made
 * against different notes says so.
 *
 * It is personal data even though it never leaves the machine, so it can be
 * read back whole and deleted whole, per score or altogether.
 */

/** Where the records live. One key, because they are read and written together. */
export const PROGRESS_KEY = 'piano.progress'

/** How many records are kept. Old attempts stop saying anything about today. */
export const KEEP_RECORDS = 500

/** How many attempts a suggestion is drawn from: a week of practice, not a year. */
export const OVER_ATTEMPTS = 12

/** How many bars a suggestion names before it stops being a place to start. */
export const SUGGEST_BARS = 4

export type BarRecord = {
  readonly bar: number
  /** Notes that were not played in time here, plus notes played that were not written. */
  readonly faults: number
  readonly of: number
}

export type PracticeRecord = {
  readonly score: string
  /** The notes as they were, so a corrected score can say its history is older than itself. */
  readonly fingerprint: string
  /** Epoch milliseconds, which is what "and when" means once it is stored. */
  readonly at: number
  readonly level: Level | null
  readonly tempoScale: number
  /** The named passages the attempt touched. */
  readonly sections: readonly string[]
  readonly tally: Tally
  readonly bars: readonly BarRecord[]
}

export type Progress = {
  readonly records: readonly PracticeRecord[]
  readonly subscribe: (listener: () => void) => () => void
  /** Which piece is being practised, and against which notes. */
  readonly use: (context: PracticeContext) => void
  /** Write an attempt down. Called for you while a grader is being watched. */
  readonly record: (attempt: Attempt) => void
  readonly forScore: (score: string) => readonly PracticeRecord[]
  readonly suggest: (score: string) => Suggestion | null
  /** Everything, as it is stored, for somebody who wants it out of here. */
  readonly exported: () => string
  /** Forget one piece's history, or all of it. */
  readonly forget: (score?: string) => void
  readonly close: () => void
}

export type PracticeContext = {
  /** The score's own id, or what it is called where it has none. */
  readonly score: string
  readonly fingerprint: string
  readonly level: Level | null
  readonly sections: readonly Section[]
}

export type Suggestion = {
  /** The bars that failed most, worst first: where to start today. */
  readonly bars: readonly number[]
  /** The named passage those bars are in, where the score names one. */
  readonly section: string | null
  readonly attempts: number
  /** The fastest a clean attempt was managed at, or null where none was. */
  readonly tempoReached: number | null
  readonly lastAt: number
  /** Whether the notes have changed since some of these records were made. */
  readonly stale: boolean
}

/**
 * What a piece is known by.
 *
 * Its own id where it has one. Where it does not, what it is called, which
 * survives being re-saved and does not survive being renamed — said here
 * rather than hidden, since it is the reason the id exists.
 */
export function scoreKey(score: Score): string {
  const id = score.metadata.id
  return id !== undefined && id.trim() !== '' ? id : `title:${score.metadata.title}`
}

/** The notes as they stand, for telling a corrected score from the one that was practised. */
export function fingerprintOf(score: Score): string {
  return checksum(score.notes ?? [])
}

/** What an attempt leaves behind, which is the counts and never the notes. */
export function recordOf(
  attempt: Attempt,
  context: PracticeContext,
  tempoScale: number,
  at: number,
): PracticeRecord {
  return {
    score: context.score,
    fingerprint: context.fingerprint,
    at,
    level: context.level,
    tempoScale,
    sections: attempt.sections.filter((one) => one.tally.of > 0).map((one) => one.id),
    tally: attempt.tally,
    bars: attempt.bars.map((bar) => ({
      bar: bar.bar,
      faults: faults(bar.tally),
      of: bar.tally.of,
    })),
  }
}

/**
 * Where to start today.
 *
 * The bars that failed most across the last few attempts, and not a
 * percentage: a number tells nobody what to do next. A bar that was played
 * cleanly since is not on the list, because the question is what still fails
 * rather than what once did.
 */
export function suggestFrom(
  records: readonly PracticeRecord[],
  sections: readonly Section[],
): Suggestion | null {
  if (records.length === 0) {
    return null
  }
  const recent = [...records].sort((one, other) => other.at - one.at).slice(0, OVER_ATTEMPTS)
  const trouble = new Map<number, number>()
  for (const record of recent) {
    for (const bar of record.bars) {
      trouble.set(bar.bar, (trouble.get(bar.bar) ?? 0) + bar.faults)
    }
  }
  const bars = [...trouble]
    .filter(([, count]) => count > 0)
    .sort((one, other) => other[1] - one[1] || one[0] - other[0])
    .slice(0, SUGGEST_BARS)
    .map(([bar]) => bar)

  const clean = recent.filter((record) => faults(record.tally) === 0)
  const latest = recent[0]
  const named = new Set(recent.flatMap((record) => record.sections))
  return {
    bars,
    section: sections.find((one) => named.has(one.id))?.label ?? null,
    attempts: records.length,
    tempoReached: clean.length === 0 ? null : Math.max(...clean.map((one) => one.tempoScale)),
    lastAt: latest?.at ?? 0,
    stale: new Set(recent.map((record) => record.fingerprint)).size > 1,
  }
}

/**
 * Where to start today, as a sentence rather than a figure.
 *
 * "Bars 17 to 20 failed most" is something somebody can act on; 68 percent is
 * something they can only feel bad about.
 */
export function describeSuggestion(suggestion: Suggestion): string {
  const attempts = `${String(suggestion.attempts)} ${suggestion.attempts === 1 ? 'attempt' : 'attempts'}`
  if (suggestion.bars.length === 0) {
    return `Nothing has failed over ${attempts}.`
  }
  const bars = `${suggestion.bars.length === 1 ? 'bar' : 'bars'} ${barNames(suggestion.bars)}`
  const where = suggestion.section === null ? '' : `, in ${suggestion.section}`
  return `Over ${attempts}, ${bars} failed most${where}. Start there.`
}

/** Where records are kept between sessions. localStorage in the app, a map in a test. */
export type Store = {
  readonly read: () => string | null
  readonly write: (value: string) => void
}

const browserStore: Store = {
  read: () => {
    try {
      return localStorage.getItem(PROGRESS_KEY)
    } catch {
      return null
    }
  },
  write: (value) => {
    try {
      localStorage.setItem(PROGRESS_KEY, value)
    } catch {
      // A history that does not persist is a disappointment; a renderer that
      // fails to start is not.
    }
  },
}

type Stored = {
  readonly version: number
  readonly records: readonly PracticeRecord[]
}

const VERSION = 1

function parse(raw: string | null): PracticeRecord[] {
  if (raw === null) {
    return []
  }
  try {
    const held: unknown = JSON.parse(raw)
    const records = (held as Partial<Stored> | null)?.records
    return Array.isArray(records) ? [...(records as PracticeRecord[])] : []
  } catch {
    // A store somebody hand-edited into nonsense is not a reason to refuse to
    // practise; it is a reason to start the history over.
    return []
  }
}

export function createProgress(
  grader: Grader,
  transport: Transport,
  options: { readonly store?: Store; readonly now?: () => number } = {},
): Progress {
  const store = options.store ?? browserStore
  const clock = options.now ?? (() => Date.now())
  let records = parse(store.read())
  let context: PracticeContext | null = null
  let seen: Attempt | null = grader.state.attempt
  const listeners = new Set<() => void>()

  const changed = () => {
    store.write(JSON.stringify({ version: VERSION, records } satisfies Stored))
    for (const listener of listeners) {
      listener()
    }
  }

  const keep = (record: PracticeRecord) => {
    records = [...records, record].slice(-KEEP_RECORDS)
    changed()
  }

  const watching = grader.subscribe(() => {
    const attempt = grader.state.attempt
    if (attempt === null || attempt === seen) {
      return
    }
    seen = attempt
    if (context !== null) {
      keep(recordOf(attempt, context, transport.tempoScale, clock()))
    }
  })

  return {
    get records() {
      return records
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    use: (next) => {
      context = next
    },
    record: (attempt) => {
      if (context !== null) {
        seen = attempt
        keep(recordOf(attempt, context, transport.tempoScale, clock()))
      }
    },
    forScore: (score) => records.filter((record) => record.score === score),
    suggest: (score) =>
      suggestFrom(
        records.filter((record) => record.score === score),
        context?.sections ?? [],
      ),
    exported: () => JSON.stringify({ version: VERSION, records }, null, 2),
    forget: (score) => {
      records = score === undefined ? [] : records.filter((record) => record.score !== score)
      changed()
    },
    close: () => {
      watching()
    },
  }
}
