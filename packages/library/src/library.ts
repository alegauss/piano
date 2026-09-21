import { libraryFileName, safeName, SCORE_SUFFIX } from '@piano/ipc'
import {
  compareForLibrary,
  matchesFilter,
  metadataSchema,
  noteEnd,
  notesOf,
  parseScore,
  ticksToSeconds,
  timingOf,
  type LibraryFilter,
  type Score,
  type ScoreMetadata,
} from '@piano/score-format'
import { z } from 'zod'

import type { Files } from './files'

/**
 * The scores on disk, and the only part of the filesystem this touches.
 *
 * A tool call is a sentence from a model, and a model that can name a path can
 * name any path. So nothing here takes one: a score is addressed by an id, the
 * id is reduced to a safe name before it is a file name at all, and every read
 * and write happens under one root directory. There is no way to write a file
 * somebody names, because a piano that can be asked to write anywhere is a
 * piano with a shell in it.
 *
 * Validation is the shared package's: a file the app would refuse must not be
 * one the library writes.
 *
 * Listing is served from an index kept beside the scores, so a library of a
 * few hundred pieces — a month of asking Claude Code for music — is listed
 * without parsing every one of them on every call. The index is a cache and
 * never the truth. Each listing compares it with the directory: a score
 * somebody dropped in by hand appears, one deleted disappears, one rewritten
 * is read again, and an index that cannot be read is rebuilt from the files,
 * never repaired and never a reason to fail. The MCP server and the app read
 * the same index through this one module, so a question asked in chat and a
 * list shown on screen get the same answer.
 */

/** The index, a dot file the listing never mistakes for a score. */
export const INDEX_FILE = '.index.json'

export type LibraryEntry = {
  readonly id: string
  readonly file: string
  readonly metadata: ScoreMetadata
  /** How long the piece lasts: as its metadata says, or worked out from its notes. */
  readonly seconds: number
  /** When the score first appeared in the library, in epoch milliseconds. */
  readonly added: number
}

/** A score that has just been filed, with the score as the format resolved it. */
export type Saved = Omit<LibraryEntry, 'seconds' | 'added'> & { readonly score: Score }

/** Easiest first, which is where somebody starting looks; or newest first, where a piece just written is. */
export type Order = 'easiest' | 'newest'

export type Library = {
  readonly root: string
  /**
   * Takes whatever a caller sent and validates it here, because the one thing
   * a library must never hold is a file the app would refuse to open.
   */
  readonly save: (score: unknown) => Promise<Saved>
  readonly read: (id: string) => Promise<Score>
  readonly list: (order?: Order) => Promise<LibraryEntry[]>
  readonly search: (filter: LibraryFilter, order?: Order) => Promise<LibraryEntry[]>
}

/** What a score is filed under: its own id where it has one, its title otherwise. */
export function libraryId(score: Score): string {
  const id = score.metadata.id
  return safeName(id !== undefined && id.trim() !== '' ? id : score.metadata.title)
}

/** How long a piece lasts, from its metadata or else from where its last note ends. */
export function durationOf(score: Score): number {
  if (score.metadata.durationSeconds !== undefined) {
    return score.metadata.durationSeconds
  }
  const end = notesOf(score).reduce((last, note) => Math.max(last, noteEnd(note)), 0)
  return ticksToSeconds(timingOf(score), end)
}

/** What the index keeps per file: enough to know it is unchanged, and what to list it as. */
const recordSchema = z.object({
  size: z.number(),
  modified: z.number(),
  added: z.number(),
  /** Null for a file that is not a score the format accepts, so it is not read again until it changes. */
  entry: z.object({ id: z.string(), metadata: metadataSchema, seconds: z.number() }).nullable(),
})

const indexSchema = z.object({
  version: z.literal(1),
  files: z.record(z.string(), recordSchema),
})

type IndexRecord = Omit<z.infer<typeof recordSchema>, 'entry'> & {
  readonly entry: {
    readonly id: string
    readonly metadata: ScoreMetadata
    readonly seconds: number
  } | null
}

export function createLibrary(root: string, files: Files): Library {
  const pathFor = (id: string) => `${root}/${libraryFileName(id)}`
  const indexPath = `${root}/${INDEX_FILE}`

  const readScore = async (path: string): Promise<Score> => {
    const parsed = parseScore(JSON.parse(await files.read(path)))
    if (!parsed.ok) {
      throw new Error(parsed.message)
    }
    return parsed.score
  }

  /** The index as last written, or null when there is none or it cannot be believed. */
  const readIndex = async (): Promise<Record<string, IndexRecord> | null> => {
    try {
      const held = indexSchema.safeParse(JSON.parse(await files.read(indexPath)))
      return held.success ? held.data.files : null
    } catch {
      return null
    }
  }

  const entries = async (): Promise<LibraryEntry[]> => {
    // An empty library and a library nobody has made yet are the same thing to
    // a caller: there is nothing to play.
    const names = (await files.list(root).catch((): readonly string[] => [])).filter((name) =>
      name.endsWith(SCORE_SUFFIX),
    )
    const held = await readIndex()
    const next: Record<string, IndexRecord> = {}
    let changed = held === null

    for (const name of names) {
      const path = `${root}/${name}`
      const found = await files.stat(path)
      if (found === null) {
        continue
      }
      const known = held?.[name]
      if (known !== undefined && known.size === found.size && known.modified === found.modified) {
        next[name] = known
        continue
      }
      changed = true
      let entry: IndexRecord['entry'] = null
      try {
        const score = await readScore(path)
        entry = {
          id: name.slice(0, -SCORE_SUFFIX.length),
          metadata: score.metadata,
          seconds: durationOf(score),
        }
      } catch {
        // One unreadable file is not a reason to refuse to list the rest.
      }
      // When it was first seen stays put through a rewrite; a file never seen
      // before, or an index being rebuilt, goes by when the file was written.
      next[name] = {
        size: found.size,
        modified: found.modified,
        added: known?.added ?? found.modified,
        entry,
      }
    }
    if (held !== null && Object.keys(held).some((name) => next[name] === undefined)) {
      changed = true
    }
    if (changed) {
      // An index that cannot be written only makes the next listing slower.
      await files
        .write(indexPath, `${JSON.stringify({ version: 1, files: next })}\n`)
        .catch(() => {})
    }

    return Object.entries(next).flatMap(([name, record]) =>
      record.entry === null
        ? []
        : [
            {
              id: record.entry.id,
              file: `${root}/${name}`,
              metadata: record.entry.metadata,
              seconds: record.entry.seconds,
              added: record.added,
            },
          ],
    )
  }

  const sorted = (found: LibraryEntry[], order: Order): LibraryEntry[] =>
    found.sort((one, other) =>
      order === 'newest'
        ? other.added - one.added || one.metadata.title.localeCompare(other.metadata.title)
        : compareForLibrary(one.metadata, other.metadata),
    )

  return {
    root,
    save: async (score) => {
      const parsed = parseScore(score)
      if (!parsed.ok) {
        throw new Error(parsed.message)
      }
      const id = libraryId(parsed.score)
      const file = pathFor(id)
      await files.ensure(root)
      await files.write(file, `${JSON.stringify(parsed.score, null, 2)}\n`)
      return { id, file, metadata: parsed.score.metadata, score: parsed.score }
    },
    read: (id) => readScore(pathFor(id)),
    list: async (order = 'easiest') => sorted(await entries(), order),
    search: async (filter, order = 'easiest') =>
      sorted(
        (await entries()).filter((entry) => matchesFilter(entry.metadata, filter)),
        order,
      ),
  }
}
