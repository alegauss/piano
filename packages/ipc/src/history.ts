import { z } from 'zod'

/**
 * The practice history, declared once.
 *
 * It is the one record this app keeps about a person rather than a piece:
 * every graded attempt leaves its counts behind, and what they are for is a
 * sentence naming the bars to go back to. Main keeps them in a file in the
 * app's profile, as it keeps the settings, and the renderer reads and writes
 * them through channels validated at both ends by the schemas below.
 *
 * Each record is read on its own. One a truncated write, a hand edit or an
 * older shape left unreadable is dropped and counted, never taking the rest
 * down with it: weeks of practice are not worth losing over one bad entry.
 *
 * Counts and never notes. A record says how many notes were missed in a bar,
 * not which, and it stays on this machine: nothing here crosses a network.
 */

/** Which shape of the file this is; a new shape comes with a migration from the old. */
export const HISTORY_VERSION = 1

/** How many records are kept. Old attempts stop saying anything about today. */
export const KEEP_RECORDS = 500

/** A count of notes, which is what an attempt leaves behind. */
const COUNT = z.number().int().nonnegative().max(1_000_000)

/** How the notes of one attempt came out, in the terms the report is drawn from. */
export const tallySchema = z.object({
  correct: COUNT,
  early: COUNT,
  late: COUNT,
  wrong: COUNT,
  missed: COUNT,
  /** Notes played that the score never asked for. */
  extra: COUNT,
  /** How many notes the score asked for here. */
  of: COUNT,
})

/** How one bar came out: enough to rank it against the others, and no notes. */
export const barRecordSchema = z.object({
  bar: z.number().int().nonnegative().max(100_000),
  /** Notes that were not played in time here, plus notes played that were not written. */
  faults: COUNT,
  of: COUNT,
})

export const practiceRecordSchema = z.object({
  /** The score's own id, or what it is called where it has none. */
  score: z.string().min(1).max(300),
  /** The notes as they were, so a corrected score can say its history is older than itself. */
  fingerprint: z.string().min(1).max(300),
  /** Epoch milliseconds, which is what "and when" means once it is stored. */
  at: z.number().int().nonnegative(),
  level: z.enum(['beginner', 'intermediate', 'advanced']).nullable(),
  /** The practice tempo it was played at, as a multiple of the written one. */
  tempoScale: z.number().positive().max(8),
  /** The named passages the attempt touched. */
  sections: z.array(z.string().min(1).max(200)).max(500),
  tally: tallySchema,
  bars: z.array(barRecordSchema).max(5000),
})

export type Tally = z.infer<typeof tallySchema>
export type BarRecord = z.infer<typeof barRecordSchema>
export type PracticeRecord = z.infer<typeof practiceRecordSchema>

/** What reading a history file came to: what survived, and how much did not. */
export type HistoryRead = {
  readonly records: readonly PracticeRecord[]
  /** How many records could not be read and were left out. */
  readonly dropped: number
  /** The file was written by a version of the app newer than this one. */
  readonly newer: boolean
}

/**
 * Records from whatever was in the file, one at a time.
 *
 * Anything that is not a history at all reads as an empty one, which is what a
 * first launch also looks like: there is no state in which the app refuses to
 * practise because of what it found on disk. Past the cap the oldest records
 * go, since that is the rule the history is kept under rather than damage, and
 * they are not counted as dropped.
 */
export function readHistory(raw: unknown): HistoryRead {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { records: [], dropped: 0, newer: false }
  }
  const held = raw as { version?: unknown; records?: unknown }
  const newer = typeof held.version === 'number' && held.version > HISTORY_VERSION
  if (!Array.isArray(held.records)) {
    return { records: [], dropped: 0, newer }
  }
  const records: PracticeRecord[] = []
  let dropped = 0
  for (const one of held.records) {
    const parsed = practiceRecordSchema.safeParse(one)
    if (parsed.success) {
      records.push(parsed.data)
    } else {
      dropped += 1
    }
  }
  return { records: records.slice(-KEEP_RECORDS), dropped, newer }
}

/** What goes in the file: the records, and the version of the shape they are in. */
export function storedHistory(records: readonly PracticeRecord[]): Record<string, unknown> {
  return { version: HISTORY_VERSION, records: records.slice(-KEEP_RECORDS) }
}

/**
 * What a piece's records are filed under.
 *
 * Its own id where it has one. Where it does not, what it is called — which
 * survives being re-saved and does not survive being renamed, and is the
 * reason the id exists. Declared here rather than in the window, because a
 * correction made from chat has to work out the same answer.
 */
export function practiceKey(metadata: { readonly id?: string; readonly title: string }): string {
  const id = metadata.id
  return id !== undefined && id.trim() !== '' ? id : `title:${metadata.title}`
}

/**
 * Where a correction made with no window open leaves what only the window can
 * finish.
 *
 * A correction gives a piece a stable id and may move it, so the records kept
 * against what it used to be called have to move with it. The window does
 * that itself when it is open; when it is not, the two processes meet where
 * they already meet — a small file under the person's home — and the app
 * applies what it finds the next time it reads the history.
 */
export const RENAMES_FILE = ['.piano', 'renames.json'] as const

export const renameSchema = z.object({
  /** The key the records are under now. */
  was: z.string().min(1).max(300),
  /** The key they belong under from here on. */
  now: z.string().min(1).max(300),
})

/** How many are kept: past this, the app was closed for longer than a note is worth. */
export const KEEP_RENAMES = 200

export const renamesSchema = z.object({
  moves: z.array(renameSchema).max(KEEP_RENAMES),
})

export type Rename = z.infer<typeof renameSchema>

/**
 * The records with those moves applied, or the very same array where none of
 * them touched anything — which is how a caller knows there is nothing to
 * write back.
 */
export function renamedRecords(
  records: readonly PracticeRecord[],
  moves: readonly Rename[],
): readonly PracticeRecord[] {
  const to = new Map(
    moves.filter((move) => move.was !== move.now).map((move) => [move.was, move.now]),
  )
  return records.some((record) => to.has(record.score))
    ? records.map((record) => {
        const now = to.get(record.score)
        return now === undefined ? record : { ...record, score: now }
      })
    : records
}
