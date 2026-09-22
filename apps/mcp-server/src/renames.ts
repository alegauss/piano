import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { KEEP_RENAMES, renamesSchema, type Rename } from '@piano/ipc'

/**
 * What a correction made with no window open leaves behind for the window.
 *
 * A correction gives a piece a stable id and may move it, so the practice
 * records kept against what it used to be called have to move with it. Only
 * the app can do that — the history is a file it owns, and two processes
 * writing one file is how a week of practice goes missing — so this side
 * leaves a note instead, in the same place under the person's home where the
 * two already find each other.
 *
 * A note nobody collects is not worth failing a tool call over: a correction
 * that landed is a correction that landed, and the worst this costs is the
 * records staying where they were, which is what happens today anyway.
 */

export type Renames = {
  readonly moved: (move: Rename) => Promise<void>
}

/** Nothing is written down, for a caller that has nowhere to write it. */
export function noRenames(): Renames {
  return { moved: () => Promise.resolve() }
}

export function fileRenames(file: string): Renames {
  return {
    moved: async (move) => {
      if (move.was === move.now) {
        return
      }
      let held: Rename[] = []
      try {
        const found = renamesSchema.safeParse(JSON.parse(await readFile(file, 'utf8')))
        held = found.success ? [...found.data.moves] : []
      } catch {
        // No file yet, or one nothing can read: either way this note is the
        // first that will be collected.
      }
      // The oldest go first past the cap: an app left closed that long has a
      // history somebody has already stopped counting on.
      const moves = [...held.filter((one) => one.was !== move.was), move].slice(-KEEP_RENAMES)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, `${JSON.stringify({ moves }, null, 2)}\n`, 'utf8')
    },
  }
}
