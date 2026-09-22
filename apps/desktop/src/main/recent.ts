import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { recentEntrySchema, type RecentEntry } from '@piano/ipc'
import { z } from 'zod'

import { replace } from './replace'

/**
 * The scores somebody opened lately.
 *
 * After the first week this is how most pieces are opened, so it has to
 * survive a restart and a file somebody moved. It lives in one small file in
 * the app's profile, newest first, and it is also the list of paths the
 * window may ask to open again by path: a page that names any other path is
 * refused, which is what keeps "open recent" from becoming "open anything".
 */

/** As many as a menu can show without scrolling. */
export const MAX_RECENT = 10

export type Recent = {
  readonly list: () => Promise<RecentEntry[]>
  /** Put a score at the top, moving it there if it was already on the list. */
  readonly add: (entry: RecentEntry) => Promise<RecentEntry[]>
  /**
   * Say a file has been corrected, and put the entry naming it right.
   *
   * The entries are a cache of titles nothing else refreshes: what a score is
   * called is copied in as it opens, and the menu reads the copy from then on.
   * A correction is a second writer, so an entry can offer a piece under a
   * name somebody has just taken back — or, since a retitle moves the file,
   * name a path that is not there and fail outright when it is picked.
   *
   * It keeps its place in the list, because what changed about the piece is
   * not when it was last opened. Nothing happens where no entry names the
   * file, which is the ordinary case.
   */
  readonly corrected: (was: string, now: RecentEntry) => Promise<RecentEntry[]>
  /**
   * Say a file has gone, and take the entry naming it off the list.
   *
   * A piece deleted from the panel is in the system's bin, and an entry that
   * offers it answers that it is not there any more — true, and not what
   * anybody picked it for. Whether a piece taken back out of the bin wants its
   * place back answers itself: it comes back through an open, which writes an
   * entry anyway.
   */
  readonly dropped: (path: string) => Promise<RecentEntry[]>
  readonly has: (path: string) => Promise<boolean>
  readonly clear: () => Promise<void>
}

const storedSchema = z.object({ entries: z.array(recentEntrySchema) })

/** Two spellings of one file are one entry; Windows and macOS ignore case, Linux does not. */
export function samePath(one: string, other: string, platform = process.platform): boolean {
  return platform === 'linux' ? one === other : one.toLowerCase() === other.toLowerCase()
}

export function createRecent(file: string, max = MAX_RECENT): Recent {
  const read = async (): Promise<RecentEntry[]> => {
    try {
      const stored = storedSchema.safeParse(JSON.parse(await readFile(file, 'utf8')))
      // A list that cannot be read is an empty one, never a reason to fail an open.
      return stored.success ? stored.data.entries.slice(0, max) : []
    } catch {
      return []
    }
  }

  const write = async (entries: RecentEntry[]): Promise<void> => {
    await mkdir(dirname(file), { recursive: true })
    // Written beside and moved into place, so a crash mid-write leaves the old list.
    const partial = `${file}.partial`
    await writeFile(partial, `${JSON.stringify({ entries }, null, 2)}\n`, 'utf8')
    await replace(partial, file)
  }

  return {
    list: read,
    add: async (entry) => {
      const kept = (await read()).filter((one) => !samePath(one.path, entry.path))
      const entries = [entry, ...kept].slice(0, max)
      await write(entries)
      return entries
    },
    corrected: async (was, now) => {
      const entries = await read()
      if (!entries.some((one) => samePath(one.path, was))) {
        return entries
      }
      const put = entries.map((one) => (samePath(one.path, was) ? now : one))
      await write(put)
      return put
    },
    dropped: async (path) => {
      const entries = await read()
      const left = entries.filter((one) => !samePath(one.path, path))
      if (left.length === entries.length) {
        return entries
      }
      await write(left)
      return left
    },
    has: async (path) => (await read()).some((one) => samePath(one.path, path)),
    clear: () => write([]),
  }
}
