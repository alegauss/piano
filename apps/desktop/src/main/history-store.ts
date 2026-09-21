import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { readHistory, storedHistory, type PracticeRecord } from '@piano/ipc'

import { replace } from './replace'

/**
 * The practice history file, which main owns.
 *
 * Read once and held; the window sends what it holds and it is written whole,
 * one write after another, into a file beside the real one and then moved over
 * it, so a crash mid-write leaves the last good history rather than half of
 * it. What cannot be read is never a reason to fail: practice starts on what
 * survived, and the window is told what was lost.
 *
 * Erasing is a delete, not an empty file. It is the one record here about a
 * person, so somebody who asks for it to go is owed nothing left behind to be
 * found later.
 */

export type HistoryLoaded = {
  readonly records: readonly PracticeRecord[]
  /** How many records could not be read and were left out. */
  readonly dropped: number
  /** Said for a person, or null where nothing was lost. */
  readonly notice: string | null
  /** No file was there: a first launch, or one after the history was erased. */
  readonly fresh: boolean
}

export type HistoryStore = {
  readonly read: () => Promise<HistoryLoaded>
  readonly write: (records: readonly PracticeRecord[]) => Promise<void>
  /** Erase it, file and all. */
  readonly clear: () => Promise<void>
  /** What is held once every write so far has landed: what a saved copy is made of. */
  readonly held: () => Promise<readonly PracticeRecord[]>
}

/** What was lost, in one sentence, or nothing to say. */
function noticeOf(dropped: number, unreadable: boolean, newer: boolean): string | null {
  const lines = [
    unreadable ? 'The practice history file could not be read, so the history starts again.' : null,
    newer ? 'This history was written by a newer version of the app.' : null,
    dropped === 0
      ? null
      : `${String(dropped)} ${dropped === 1 ? 'attempt' : 'attempts'} could not be read and ${
          dropped === 1 ? 'was' : 'were'
        } left out.`,
  ].filter((line) => line !== null)
  return lines.length === 0 ? null : lines.join(' ')
}

async function load(file: string): Promise<HistoryLoaded> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return { records: [], dropped: 0, notice: null, fresh: true }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { records: [], dropped: 0, notice: noticeOf(0, true, false), fresh: false }
  }
  const { records, dropped, newer } = readHistory(raw)
  return { records, dropped, notice: noticeOf(dropped, false, newer), fresh: false }
}

export function createHistoryStore(file: string): HistoryStore {
  let loaded: Promise<HistoryLoaded> | null = null
  let held: readonly PracticeRecord[] | null = null
  let writing: Promise<unknown> = Promise.resolve()

  const current = async (): Promise<readonly PracticeRecord[]> => {
    loaded ??= load(file)
    held ??= (await loaded).records
    return held
  }

  /**
   * One change after another, the read that precedes it included, so a write
   * arriving while an earlier one is still on disk cannot overtake it and
   * leave the older history as the one that stayed.
   */
  const change = (
    next: (records: readonly PracticeRecord[]) => Promise<readonly PracticeRecord[]>,
  ) => {
    const run = writing.then(async () => {
      held = await next(await current())
    })
    // One failed write must not stop every later one from being tried.
    writing = run.catch(() => {})
    return run
  }

  return {
    // What was found at launch, with every write since: a window that reloads
    // is told the history as it is, not as it was.
    read: async () => {
      const first = await (loaded ??= load(file))
      return { ...first, records: held ?? first.records }
    },
    write: (records) =>
      change(async () => {
        await mkdir(dirname(file), { recursive: true })
        const partial = `${file}.partial`
        await writeFile(partial, `${JSON.stringify(storedHistory(records), null, 2)}\n`, 'utf8')
        await replace(partial, file)
        return records
      }),
    clear: () =>
      change(async () => {
        // The half-written file goes too: erased means nothing left to read.
        await rm(`${file}.partial`, { force: true })
        await rm(file, { force: true })
        return []
      }),
    held: async () => {
      const records = await current()
      await writing
      return held ?? records
    },
  }
}
