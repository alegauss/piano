import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'

/**
 * The filesystem, as the library needs it and no more.
 *
 * Handed in rather than imported, which is how a test can ask the one
 * question that matters of a library — what did it write, and where — and
 * how the index can be shown to read a file once rather than on every call.
 */

/** What the index compares to know a file has not changed since it was read. */
export type FileStat = {
  readonly size: number
  /** Last written, in epoch milliseconds. */
  readonly modified: number
}

export type Files = {
  readonly read: (path: string) => Promise<string>
  readonly write: (path: string, text: string) => Promise<void>
  readonly list: (dir: string) => Promise<readonly string[]>
  readonly ensure: (dir: string) => Promise<void>
  /** A file's size and when it was written, or null when it is not a file. */
  readonly stat: (path: string) => Promise<FileStat | null>
  /** Remove a file, and say nothing when it is already gone. */
  readonly remove: (path: string) => Promise<void>
  /**
   * Take a file away because somebody asked, which is a different act from
   * removing one this module wrote.
   *
   * A score under the name it was kept under before is housekeeping, and
   * nobody wants it in a bin. A piece somebody deleted is the only copy of
   * something they may have asked for last week, and a host with a bin should
   * put it there. So the two are separate, and a host with nowhere to put it
   * answers with what it can do.
   */
  readonly discard: (path: string) => Promise<void>
}

/** Node's filesystem. */
export const nodeFiles: Files = {
  read: (path) => readFile(path, 'utf8'),
  write: (path, text) => writeFile(path, text, 'utf8'),
  list: (dir) => readdir(dir),
  ensure: async (dir) => {
    await mkdir(dir, { recursive: true })
  },
  stat: async (path) => {
    try {
      const found = await stat(path)
      return found.isFile() ? { size: found.size, modified: found.mtimeMs } : null
    } catch {
      return null
    }
  },
  remove: (path) => rm(path, { force: true }),
  // Plain Node has no bin. A host that has one — Electron, through
  // shell.trashItem — hands in its own, and this is what is left otherwise.
  discard: (path) => rm(path, { force: true }),
}

/**
 * A filesystem held in a map, for a test or anything that wants a library with
 * no disk under it. Every write moves its clock on, so a rewritten file looks
 * rewritten; `reads` counts what was read, which is how a test sees the index
 * spare a file it already knows.
 */
export function memoryFiles(seed: Readonly<Record<string, string>> = {}): Files & {
  readonly held: Map<string, string>
  readonly reads: string[]
  /** What was taken away on somebody's behalf, which a bin would now hold. */
  readonly discarded: string[]
} {
  const held = new Map(Object.entries(seed))
  const written = new Map<string, number>([...held.keys()].map((path) => [path, 0]))
  const reads: string[] = []
  const discarded: string[] = []
  let clock = 1
  return {
    held,
    reads,
    discarded,
    read: (path) => {
      reads.push(path)
      const text = held.get(path)
      return text === undefined
        ? Promise.reject(new Error(`no such file: ${path}`))
        : Promise.resolve(text)
    },
    write: (path, text) => {
      held.set(path, text)
      clock += 1
      written.set(path, clock)
      return Promise.resolve()
    },
    list: (dir) =>
      Promise.resolve(
        [...held.keys()]
          .filter((path) => path.startsWith(`${dir}/`))
          .map((path) => path.slice(dir.length + 1)),
      ),
    ensure: () => Promise.resolve(),
    stat: (path) => {
      const text = held.get(path)
      return Promise.resolve(
        text === undefined ? null : { size: text.length, modified: written.get(path) ?? 0 },
      )
    },
    remove: (path) => {
      held.delete(path)
      return Promise.resolve()
    },
    discard: (path) => {
      discarded.push(path)
      held.delete(path)
      return Promise.resolve()
    },
  }
}
