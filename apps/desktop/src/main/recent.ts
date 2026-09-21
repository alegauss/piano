import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { recentEntrySchema, type RecentEntry } from '@piano/ipc'
import { z } from 'zod'

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
    await rename(partial, file)
  }

  return {
    list: read,
    add: async (entry) => {
      const kept = (await read()).filter((one) => !samePath(one.path, entry.path))
      const entries = [entry, ...kept].slice(0, max)
      await write(entries)
      return entries
    },
    has: async (path) => (await read()).some((one) => samePath(one.path, path)),
    clear: () => write([]),
  }
}
