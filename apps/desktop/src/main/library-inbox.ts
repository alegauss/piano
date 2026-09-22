import { libraryId, type Files, type Library } from '@piano/library'
import { z } from 'zod'

import { isOpenable, isScoreFile, type Opened, type Refused } from './score-files'

/**
 * The library folder as an inbox.
 *
 * A score copied into `~/.piano/library` appears in the list, because the
 * listing walks the folder and the watcher makes it immediate. A MIDI file
 * copied into the same folder does nothing at all: `libraryIdOfFile` answers
 * null for it, the listing skips it, and nothing is refused or said. That it
 * works for one kind of file out of six is the part nobody can guess from
 * outside — and a folder of downloads is exactly what somebody has.
 *
 * So a `.mid`, `.musicxml` or `.mxl` found here is imported once, through the
 * same reader the dialog uses, and filed as a `.piano` beside it. The original
 * is left where it is: it is somebody's file, not the app's.
 *
 * Three things keep the sweep from making a mess of a folder somebody is
 * copying into:
 *
 * An import is never a replacement. Where the id the piece would take is
 * already somebody else's, the file is left alone rather than filed under a
 * numbered name: nobody is here to be asked, and the door in the window is
 * where that question gets answered. Which also means this cannot
 * duplicate a library: the id being taken is the same answer however many
 * times it is asked.
 *
 * A file still being copied is not read. A file written moments ago is left
 * for the next sweep, and the answer says how many are waiting so the caller
 * can come back for them.
 *
 * A file that could not be imported is remembered, by size and modification
 * time, so the failure is not retried on every listing — and is retried the
 * moment the file changes, which is what a half-copied file eventually does.
 */

/** What the sweep remembers about the files it has already looked at. */
const RECORD_FILE = '.imported.json'

const recordSchema = z.object({
  version: z.literal(1),
  files: z.record(
    z.string(),
    z.object({
      size: z.number(),
      modified: z.number(),
      /** What it was filed as, where it was; absent where it was not. */
      id: z.string().optional(),
      /** Why it was not, in the words the reader used. */
      left: z.string().optional(),
    }),
  ),
})

/** What the record holds, by the file name it is about. */
type Seen = z.infer<typeof recordSchema>['files']

/** How long a file must have sat still before it is read, in milliseconds. */
export const SETTLE_MS = 2000

export type Swept = {
  /** What was imported and filed, by the id it took. */
  readonly filed: readonly { readonly name: string; readonly id: string }[]
  /** What was looked at and left, with the reason: unreadable, or an id already taken. */
  readonly left: readonly { readonly name: string; readonly why: string }[]
  /** How many were too freshly written to read, which is a reason to sweep again. */
  readonly waiting: number
}

export type Inbox = {
  /**
   * Take in whatever is new. Concurrent calls share one sweep: the watcher
   * fires on this sweep's own writes, and two passes over one folder would
   * import the same file twice.
   */
  readonly sweep: () => Promise<Swept>
}

export function createInbox(deps: {
  readonly root: string
  readonly files: Files
  readonly library: Pick<Library, 'save' | 'held'>
  /** The one reader every way of opening a score goes through. */
  readonly open: (path: string) => Promise<Opened | Refused>
  readonly now?: () => number
}): Inbox {
  const { root, files, library, open } = deps
  const now = deps.now ?? Date.now
  const recordPath = `${root}/${RECORD_FILE}`
  let running: Promise<Swept> | null = null

  const readRecord = async (): Promise<Seen> => {
    try {
      const held = recordSchema.safeParse(JSON.parse(await files.read(recordPath)))
      return held.success ? held.data.files : {}
    } catch {
      // Never swept, or a record that cannot be read. Nothing is lost: an id
      // already taken is left alone, so the worst case is one wasted read.
      return {}
    }
  }

  const run = async (): Promise<Swept> => {
    const names = (await files.list(root).catch((): readonly string[] => [])).filter(
      (name) => isOpenable(name) && !isScoreFile(name),
    )
    const record = await readRecord()
    const next: Seen = {}
    const filed: { name: string; id: string }[] = []
    const left: { name: string; why: string }[] = []
    let waiting = 0
    let changed = false

    for (const name of names) {
      const path = `${root}/${name}`
      const found = await files.stat(path)
      if (found === null) {
        continue
      }
      const known = record[name]
      if (known !== undefined && known.size === found.size && known.modified === found.modified) {
        next[name] = known
        continue
      }
      if (now() - found.modified < SETTLE_MS) {
        // Still being written, most likely. Nothing is recorded, so the next
        // sweep looks at it again rather than believing this one.
        waiting += 1
        continue
      }

      changed = true
      const opened = await open(path)
      if (opened.kind !== 'opened') {
        next[name] = { size: found.size, modified: found.modified, left: opened.message }
        left.push({ name, why: opened.message })
        continue
      }
      const id = libraryId(opened.score)
      if ((await library.held(id)) !== null) {
        const why = `the library already has a ${id}`
        next[name] = { size: found.size, modified: found.modified, left: why }
        left.push({ name, why })
        continue
      }
      try {
        const saved = await library.save({
          ...opened.score,
          metadata: { ...opened.score.metadata, id },
        })
        next[name] = { size: found.size, modified: found.modified, id: saved.id }
        filed.push({ name, id: saved.id })
      } catch (error: unknown) {
        const why = error instanceof Error ? error.message : String(error)
        next[name] = { size: found.size, modified: found.modified, left: why }
        left.push({ name, why })
      }
    }

    if (changed || Object.keys(record).some((name) => next[name] === undefined)) {
      // A record that cannot be written only makes the next sweep do the
      // reading again, which is why nothing here fails on it.
      await files
        .write(recordPath, `${JSON.stringify({ version: 1, files: next })}\n`)
        .catch(() => {})
    }

    return { filed, left, waiting }
  }

  return {
    sweep: () => {
      running ??= run().finally(() => {
        running = null
      })
      return running
    },
  }
}
