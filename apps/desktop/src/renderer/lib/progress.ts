import {
  KEEP_RECORDS,
  practiceKey,
  readHistory,
  storedHistory,
  type HistorySaveResult,
  type PianoBridge,
  type PracticeRecord,
} from '@piano/ipc'
import { checksum, type Level, type Score, type Section } from '@piano/score-format'

import type { Transport } from '../audio'
import { readBridge } from '../bridge'
import type { Grader } from './grader'
import { barNames, faults, type Attempt } from './grading'

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
 * Main owns the file, as it owns the settings; this holds a copy, changes it
 * at once so a report is never a round trip behind, and sends the whole list
 * on. An older version kept the records in the browser's own storage, and the
 * first launch that finds no file moves what was there into it.
 *
 * It is personal data even though it never leaves the machine, so it can be
 * saved as a file somebody keeps and erased, per piece or altogether.
 */

/** Where an older version kept the records, read once so that history is not lost. */
export const PROGRESS_KEY = 'piano.progress'

/** How many attempts a suggestion is drawn from: a week of practice, not a year. */
export const OVER_ATTEMPTS = 12

/** How many bars a suggestion names before it stops being a place to start. */
export const SUGGEST_BARS = 4

export type { BarRecord, PracticeRecord } from '@piano/ipc'

export type Progress = {
  readonly records: readonly PracticeRecord[]
  /** What could not be read or could not be saved, said for a person. */
  readonly notice: string | null
  readonly subscribe: (listener: () => void) => () => void
  /** Read what is kept, once however often it is asked. */
  readonly load: () => Promise<void>
  /** Which piece is being practised, and against which notes. */
  readonly use: (context: PracticeContext) => void
  /** Write an attempt down. Called for you while a grader is being watched. */
  readonly record: (attempt: Attempt) => void
  readonly forScore: (score: string) => readonly PracticeRecord[]
  readonly suggest: (score: string) => Suggestion | null
  /**
   * The history as it is stored, for somebody who wants it out of here: one
   * piece's where a score is named, all of it where none is.
   */
  readonly exported: (score?: string) => string
  /**
   * Move one piece's records to the key it is known by now.
   *
   * A piece with no id of its own is known by its title, so correcting the
   * title would otherwise start its record over — weeks of practice lost to
   * somebody spelling a composer properly. Nothing is written where no record
   * is under the old key, which is most corrections.
   */
  readonly rename: (was: string, now: string) => void
  /** Forget one piece's history. */
  readonly forget: (score: string) => void
  /** Erase all of it, file and all. */
  readonly erase: () => Promise<void>
  /** Save it as a file somebody keeps, main asking where. */
  readonly keep: () => Promise<HistorySaveResult>
  /** The notice has been read. */
  readonly dismiss: () => void
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
 * What a piece is known by: its own id where it has one, and what it is
 * called where it does not. The rule is the contract's, because a correction
 * made from chat with no window open has to work out the same answer.
 */
export function scoreKey(score: Score): string {
  return practiceKey(score.metadata)
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

/** What was kept, and what of it was lost on the way back. */
export type Kept = {
  readonly records: readonly PracticeRecord[]
  readonly notice: string | null
  /** No file was there: a first launch, or one after the history was erased. */
  readonly fresh: boolean
}

/**
 * Where the history is kept, and the doors on it. Main in the app, a fake in
 * a test. Saving and erasing answer, so a door that failed can say so instead
 * of looking as though it worked.
 */
export type Store = {
  readonly load: () => Promise<Kept>
  readonly save: (records: readonly PracticeRecord[]) => Promise<void>
  readonly erase: () => Promise<void>
  readonly keep: () => Promise<HistorySaveResult>
}

type HistoryBridge = Pick<
  PianoBridge,
  'readHistory' | 'writeHistory' | 'saveHistory' | 'clearHistory'
>

/** The browser storage an older version wrote to, as far as moving out of it needs. */
export type Legacy = {
  readonly get: (key: string) => string | null
  readonly remove: (key: string) => void
}

const browserLegacy: Legacy = {
  get: (key) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key)
    } catch {
      // Left behind, it is read by nothing.
    }
  },
}

/**
 * What an older version kept in the browser, as records.
 *
 * Read through the same schema the file is read through, so a store somebody
 * hand-edited into nonsense costs the records that are nonsense and not the
 * move. `found` is whether there was anything there at all, which is what says
 * the key can go.
 */
export function legacyRecords(legacy: Legacy): {
  records: readonly PracticeRecord[]
  found: boolean
} {
  const raw = legacy.get(PROGRESS_KEY)
  if (raw === null) {
    return { records: [], found: false }
  }
  try {
    return { records: readHistory(JSON.parse(raw)).records, found: true }
  } catch {
    return { records: [], found: true }
  }
}

/** The store main is behind, or one that keeps nothing where there is no bridge. */
export function bridgeStore(bridge: HistoryBridge | null): Store {
  if (bridge === null) {
    return {
      load: () => Promise.resolve({ records: [], notice: null, fresh: false }),
      save: () => Promise.resolve(),
      erase: () => Promise.resolve(),
      keep: () =>
        Promise.resolve({
          kind: 'refused',
          message: 'this page is not running inside the app',
        }),
    }
  }
  return {
    load: async () => {
      const read = await bridge.readHistory()
      return { records: read.records, notice: read.notice, fresh: read.fresh }
    },
    save: async (records) => {
      await bridge.writeHistory({ records: [...records] })
    },
    erase: async () => {
      await bridge.clearHistory()
    },
    keep: () => bridge.saveHistory(),
  }
}

const because = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))

export function createProgress(
  grader: Grader,
  transport: Transport,
  options: {
    readonly store?: Store
    readonly now?: () => number
    readonly legacy?: Legacy
  } = {},
): Progress {
  const store = options.store ?? bridgeStore(readBridge())
  const legacy = options.legacy ?? browserLegacy
  const clock = options.now ?? (() => Date.now())
  let records: readonly PracticeRecord[] = []
  let notice: string | null = null
  let loading: Promise<void> | null = null
  let context: PracticeContext | null = null
  let seen: Attempt | null = grader.state.attempt
  const listeners = new Set<() => void>()

  const told = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  const write = () => {
    store.save(records).catch((cause: unknown) => {
      notice = `The practice history could not be saved: ${because(cause)}`
      told()
    })
  }

  const changed = () => {
    write()
    told()
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
    get notice() {
      return notice
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    load: () =>
      (loading ??= (async () => {
        try {
          const kept = await store.load()
          // An attempt graded while the file was being read is kept: it is
          // the newest thing here, and the read knew nothing about it.
          const during = records
          records = [...kept.records, ...during].slice(-KEEP_RECORDS)
          notice = kept.notice
          const moved = kept.fresh ? legacyRecords(legacy) : { records: [], found: false }
          if (moved.records.length > 0) {
            records = [...moved.records, ...records].slice(-KEEP_RECORDS)
          }
          if (moved.found) {
            legacy.remove(PROGRESS_KEY)
          }
          if (during.length > 0 || moved.records.length > 0) {
            write()
          }
        } catch (cause: unknown) {
          notice = `The practice history could not be read: ${because(cause)}`
        }
        told()
      })()),
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
    exported: (score) =>
      JSON.stringify(
        storedHistory(
          score === undefined ? records : records.filter((record) => record.score === score),
        ),
        null,
        2,
      ),
    rename: (was, now) => {
      if (was === now || !records.some((record) => record.score === was)) {
        return
      }
      records = records.map((record) => (record.score === was ? { ...record, score: now } : record))
      changed()
    },
    forget: (score) => {
      records = records.filter((record) => record.score !== score)
      changed()
    },
    // The file goes first. A window that emptied itself over a delete that
    // failed would say the history was gone and find it again at the next
    // launch, which is the one answer a person asking for this must not get.
    erase: async () => {
      try {
        await store.erase()
        records = []
      } catch (cause: unknown) {
        notice = `The practice history could not be erased: ${because(cause)}`
      }
      told()
    },
    keep: () => store.keep(),
    dismiss: () => {
      notice = null
      told()
    },
    close: () => {
      watching()
    },
  }
}
