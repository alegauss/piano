import {
  libraryFileName,
  libraryFileNames,
  libraryIdOfFile,
  MAX_LIBRARY_NAME,
  safeName,
  SCORE_SUFFIX,
} from '@piano/ipc'
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
  type Level,
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

/**
 * What a piece says about itself, as the one form that asks says it.
 *
 * These five and no others: they are the fields a listing reads, and the only
 * ones somebody can be wrong about without being wrong about the music. Each
 * is replaced rather than merged — a composer left out is a composer removed,
 * or there would be no taking back what a MIDI track name claimed. Everything
 * else the score carries, its notes and its arrangements and where it came
 * from, is not this function's business.
 */
export type Correction = {
  readonly title: string
  readonly composer?: string
  readonly level?: Level
  readonly difficulty?: number
  readonly tags?: readonly string[]
}

/** Easiest first, which is where somebody starting looks; or newest first, where a piece just written is. */
export type Order = 'easiest' | 'newest'

export type Library = {
  readonly root: string
  /**
   * Takes whatever a caller sent and validates it here, because the one thing
   * a library must never hold is a file the app would refuse to open.
   */
  readonly save: (score: unknown) => Promise<Saved>
  /**
   * What is filed under an id already, or null where nothing is.
   *
   * Asked by a caller that must not overwrite blindly — the window filing an
   * import, whose id is whatever a track name happened to say — and ignored by
   * one saving a correction to a piece it just wrote. It reads one file rather
   * than listing, so asking before every save costs a stat and a parse.
   */
  readonly held: (id: string) => Promise<LibraryEntry | null>
  /** The nearest id to this one that nothing holds: the id itself, or it numbered. */
  readonly free: (id: string) => Promise<string>
  /**
   * Correct what a filed piece says about itself, leaving its notes alone.
   *
   * Under the id it is already filed as, whatever the new title says: the id
   * is the handle a chat, a shortcut and a practice record all hold, and
   * moving the file because somebody fixed a spelling would break all three
   * at once. Null where nothing is filed under that id, which is the answer
   * for a row somebody deleted while the form was open.
   */
  readonly correct: (id: string, correction: Correction) => Promise<Saved | null>
  readonly read: (id: string) => Promise<Score>
  readonly list: (order?: Order) => Promise<LibraryEntry[]>
  readonly search: (filter: LibraryFilter, order?: Order) => Promise<LibraryEntry[]>
  /**
   * Put the scores an app ships with into the library, each one once. One
   * somebody deleted is not put back, and one whose id a score of their own
   * already has is left alone: seeding gives, it never overwrites. Answers
   * with the ids it added.
   */
  readonly seed: (scores: readonly unknown[]) => Promise<string[]>
}

/** Which shipped scores have been put in the library before, so none comes back once deleted. */
export const SEEDED_FILE = '.seeded.json'

const seededSchema = z.object({ ids: z.array(z.string()) })

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

  /** Where a score is kept now: under the suffix it is written as, or the one it had before. */
  const foundFor = async (id: string): Promise<string | null> => {
    for (const name of libraryFileNames(id)) {
      if ((await files.stat(`${root}/${name}`)) !== null) {
        return `${root}/${name}`
      }
    }
    return null
  }

  /**
   * Write a score under its id, and take away the file it had under the old
   * suffix: saving it again is the moment it moves, and leaving the old one
   * would bring last week's version back the day the new one is deleted.
   */
  const keep = async (id: string, score: Score): Promise<string> => {
    const file = pathFor(id)
    await files.ensure(root)
    await files.write(file, `${JSON.stringify(score, null, 2)}\n`)
    for (const name of libraryFileNames(id)) {
      if (`${root}/${name}` !== file) {
        await files.remove(`${root}/${name}`)
      }
    }
    return file
  }

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
    const listed = (await files.list(root).catch((): readonly string[] => [])).filter(
      (name) => libraryIdOfFile(name) !== null,
    )
    // Where one id is there under both suffixes, the file written as a score
    // is now is the one; the other is what it was before.
    const current = new Set(listed.filter((name) => name.endsWith(SCORE_SUFFIX)))
    const names = listed.filter(
      (name) =>
        name.endsWith(SCORE_SUFFIX) ||
        !current.has(`${libraryIdOfFile(name) ?? ''}${SCORE_SUFFIX}`),
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
          id: libraryIdOfFile(name) ?? name,
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
      const file = await keep(id, parsed.score)
      return { id, file, metadata: parsed.score.metadata, score: parsed.score }
    },
    held: async (id) => {
      const path = await foundFor(id)
      if (path === null) {
        return null
      }
      const found = await files.stat(path)
      let score: Score
      try {
        score = await readScore(path)
      } catch {
        // A file the format refuses is not a piece: the listing leaves it out
        // for the same reason, and there is nothing to describe to somebody
        // being asked whether to replace it.
        return null
      }
      return {
        id,
        file: path,
        metadata: score.metadata,
        seconds: durationOf(score),
        added: found?.modified ?? 0,
      }
    },
    /**
     * Numbered from two, as a person names a second copy of anything. The id
     * stays recognisable, which matters because it is what a list row, a
     * sentence in chat and the file on disk all call the piece.
     */
    free: async (id) => {
      const base = safeName(id)
      if ((await foundFor(base)) === null) {
        return base
      }
      for (let next = 2; next < 1000; next += 1) {
        const tail = `-${String(next)}`
        // Room is made for the number before the name is cut to length, or the
        // cut would take the number off and hand back the taken name again.
        const candidate = safeName(`${base.slice(0, MAX_LIBRARY_NAME - tail.length)}${tail}`)
        if ((await foundFor(candidate)) === null) {
          return candidate
        }
      }
      throw new Error(`the library already holds a thousand pieces called ${base}`)
    },
    correct: async (id, correction) => {
      const path = await foundFor(id)
      if (path === null) {
        return null
      }
      const held = await readScore(path)
      // Spread the correction over what is left of the metadata rather than
      // over the metadata itself: the five fields it owns go even where it
      // says nothing about them, and the rest of the score is untouched.
      const {
        composer: _composer,
        difficulty: _difficulty,
        level: _level,
        tags: _tags,
        ...rest
      } = held.metadata
      const parsed = parseScore({
        ...held,
        metadata: {
          ...rest,
          ...correction,
          ...(correction.tags === undefined ? {} : { tags: [...correction.tags] }),
        },
      })
      if (!parsed.ok) {
        throw new Error(parsed.message)
      }
      const file = await keep(id, parsed.score)
      return { id, file, metadata: parsed.score.metadata, score: parsed.score }
    },
    read: async (id) => readScore((await foundFor(id)) ?? pathFor(id)),
    seed: async (scores) => {
      const seededPath = `${root}/${SEEDED_FILE}`
      let seeded: string[] = []
      try {
        const held = seededSchema.safeParse(JSON.parse(await files.read(seededPath)))
        seeded = held.success ? held.data.ids : []
      } catch {
        // Never seeded, or a record that cannot be read: at worst a deleted
        // score comes back once, which is better than a library left empty.
      }
      const added: string[] = []
      for (const raw of scores) {
        const parsed = parseScore(raw)
        if (!parsed.ok) {
          throw new Error(`a score the app ships with is not valid: ${parsed.message}`)
        }
        const id = libraryId(parsed.score)
        if (seeded.includes(id)) {
          continue
        }
        seeded.push(id)
        if ((await foundFor(id)) !== null) {
          continue
        }
        await keep(id, parsed.score)
        added.push(id)
      }
      await files.ensure(root)
      await files.write(seededPath, `${JSON.stringify({ ids: seeded })}\n`)
      return added
    },
    list: async (order = 'easiest') => sorted(await entries(), order),
    search: async (filter, order = 'easiest') =>
      sorted(
        (await entries()).filter((entry) => matchesFilter(entry.metadata, filter)),
        order,
      ),
  }
}
