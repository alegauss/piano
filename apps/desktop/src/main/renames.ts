import { readFile, rm } from 'node:fs/promises'

import { renamesSchema, type Rename } from '@piano/ipc'

/**
 * What a correction made while the app was closed left for it to finish.
 *
 * Claude Code can correct a library piece with no window open, and a
 * correction gives a piece a stable id and may move it. The records kept
 * against what it used to be called are in a file this process owns, so the
 * other side leaves a note rather than writing them, and this is the side
 * that reads it.
 *
 * Read once, applied, and taken away: a note collected twice would move
 * records that have since been filed under the new key back and forth for
 * nothing. A file that cannot be read is no notes — practice that survived is
 * worth more than a note about where it should be filed.
 */

export type Renames = {
  readonly pending: () => Promise<readonly Rename[]>
  /** They have been applied, so the note is spent. */
  readonly done: () => Promise<void>
}

/** Nothing was left, which is every launch the app was open for. */
export function noRenames(): Renames {
  return { pending: () => Promise.resolve([]), done: () => Promise.resolve() }
}

export function fileRenames(file: string): Renames {
  return {
    pending: async () => {
      try {
        const found = renamesSchema.safeParse(JSON.parse(await readFile(file, 'utf8')))
        return found.success ? found.data.moves : []
      } catch {
        return []
      }
    },
    done: () => rm(file, { force: true }),
  }
}
