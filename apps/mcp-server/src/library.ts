import {
  compareForLibrary,
  matchesFilter,
  parseScore,
  type LibraryFilter,
  type Score,
  type ScoreMetadata,
} from '@piano/score-format'

/**
 * The scores on disk, and the only part of the filesystem this server touches.
 *
 * A tool call is a sentence from a model, and a model that can name a path can
 * name any path. So nothing here takes one: a score is addressed by an id, the
 * id is reduced to a safe name before it is a file name at all, and every read
 * and write happens under one root directory. What is not offered is the point
 * of the design — there is no tool that writes a file somebody names, because
 * a piano that can be asked to write anywhere is a piano with a shell in it.
 *
 * Validation is the shared package's, never this server's: a file the app
 * would refuse must not be one the server writes.
 */

/** How the file for a score is named, so a listing can find it again. */
export const SCORE_SUFFIX = '.score.json'

/** Long enough for a title, short enough to stay a file name everywhere. */
const MAX_NAME = 64

export type LibraryEntry = {
  readonly id: string
  readonly file: string
  readonly metadata: ScoreMetadata
}

/** The filesystem, as the library needs it. Node's in the app, a map in a test. */
export type Files = {
  readonly read: (path: string) => Promise<string>
  readonly write: (path: string, text: string) => Promise<void>
  readonly list: (dir: string) => Promise<readonly string[]>
  readonly ensure: (dir: string) => Promise<void>
}

/** A score that has just been filed, with the score as the format resolved it. */
export type Saved = LibraryEntry & { readonly score: Score }

export type Library = {
  readonly root: string
  /**
   * Takes whatever a caller sent and validates it here, because the one thing
   * a library must never hold is a file the app would refuse to open.
   */
  readonly save: (score: unknown) => Promise<Saved>
  readonly read: (id: string) => Promise<Score>
  readonly list: () => Promise<LibraryEntry[]>
  readonly search: (filter: LibraryFilter) => Promise<LibraryEntry[]>
}

/**
 * A name reduced to what a file system and a URL both accept.
 *
 * Everything else goes, rather than being escaped: an id is an address and not
 * a title, and the one thing it must never do is climb out of the library.
 */
export function safeName(name: string): string {
  const reduced = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_NAME)
    .replace(/^-+/, '')
    .replace(/-+$/, '')
  return reduced === '' ? 'score' : reduced
}

/** What a score is filed under: its own id where it has one, its title otherwise. */
export function libraryId(score: Score): string {
  const id = score.metadata.id
  return safeName(id !== undefined && id.trim() !== '' ? id : score.metadata.title)
}

export function createLibrary(root: string, files: Files): Library {
  const pathFor = (id: string) => `${root}/${safeName(id)}${SCORE_SUFFIX}`

  const readScore = async (path: string): Promise<Score> => {
    const parsed = parseScore(JSON.parse(await files.read(path)))
    if (!parsed.ok) {
      throw new Error(parsed.message)
    }
    return parsed.score
  }

  const entries = async (): Promise<LibraryEntry[]> => {
    // An empty library and a library nobody has made yet are the same thing to
    // a caller: there is nothing to play.
    const names = await files.list(root).catch((): readonly string[] => [])
    const found: LibraryEntry[] = []
    for (const name of names.filter((one) => one.endsWith(SCORE_SUFFIX))) {
      try {
        const score = await readScore(`${root}/${name}`)
        found.push({
          id: name.slice(0, -SCORE_SUFFIX.length),
          file: `${root}/${name}`,
          metadata: score.metadata,
        })
      } catch {
        // One unreadable file is not a reason to refuse to list the rest.
        continue
      }
    }
    return found.sort((one, other) => compareForLibrary(one.metadata, other.metadata))
  }

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
    list: entries,
    search: async (filter) =>
      (await entries()).filter((entry) => matchesFilter(entry.metadata, filter)),
  }
}
