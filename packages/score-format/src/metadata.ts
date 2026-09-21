import type { Level } from './arrangement'

/**
 * What a library lists a score by, and what a licence check reads.
 *
 * Provenance is here for a reason beyond tidiness. The roadmap says outright
 * that copyrighted scores are not shipped, and a rule with nothing checking it
 * is a rule the third contributor breaks. So a bundled score names where its
 * notes came from and under what licence, and the packaging step can refuse a
 * build where one does not.
 */

/** Licences a bundled score may carry. Anything else needs a person to decide. */
export const PUBLIC_DOMAIN_LICENCES = ['public-domain', 'CC0', 'CC-BY', 'CC-BY-SA'] as const

/** A key signature's tonic, from seven flats to seven sharps. */
const MAJOR_KEYS: readonly string[] = 'Cb Gb Db Ab Eb Bb F C G D A E B F# C#'.split(' ')
const MINOR_KEYS: readonly string[] = 'Ab Eb Bb F C G D A E B F# C# G# D# A#'.split(' ')

/**
 * The `key` a signature means, such as "Eb major", or null for a count of
 * sharps no signature has. Both importers need it and the field is metadata's,
 * so the table lives here rather than once per format that carries one.
 */
export function keyNameOf(sharps: number, minor: boolean): string | null {
  const name = (minor ? MINOR_KEYS : MAJOR_KEYS)[sharps + 7]
  return name === undefined ? null : `${name} ${minor ? 'minor' : 'major'}`
}

/** The other direction: what a written key means as sharps, or null for prose. */
export function keySignatureOf(key: string): { sharps: number; minor: boolean } | null {
  const match = /^\s*([A-G])(#|b)?\s*(major|minor|maj|min|m)?\s*$/i.exec(key)
  if (match === null) {
    return null
  }
  const [, letter = '', accidental = '', mode = ''] = match
  const minor = mode.toLowerCase().startsWith('min') || mode === 'm'
  const sharps =
    (minor ? MINOR_KEYS : MAJOR_KEYS).indexOf(`${letter.toUpperCase()}${accidental}`) - 7
  return sharps < -7 ? null : { sharps, minor }
}

export type Licence = (typeof PUBLIC_DOMAIN_LICENCES)[number] | (string & {})

export type Provenance = {
  /** Where the notes came from: a URL, an edition, or the name of whoever entered them. */
  readonly source: string
  readonly licence: Licence
  /** Who to credit, where the licence asks for it. */
  readonly attribution?: string
}

export type ScoreMetadata = {
  /**
   * Stable, and the one field that is not about the music.
   *
   * Practice history is recorded against it, the way progress on a passage is
   * recorded against a section id: a piece that is re-saved, retitled or
   * corrected is the same piece, and weeks of records should not turn on
   * somebody fixing a wrong note or spelling the composer properly. A score
   * without one is still playable; its history is then keyed on what it is
   * called, and a rename starts it over.
   */
  readonly id?: string
  /** What the piece is called: the one field a score may not omit. */
  readonly title: string
  readonly composer?: string
  readonly arranger?: string
  /** A hint for display, such as "D minor". The notes remain the truth. */
  readonly key?: string
  /**
   * How hard the piece is, one to ten, beside the level word.
   *
   * Both, because the library filters on the word and sorting inside a level
   * wants the number. One without the other means either a filter that cannot
   * group or a sort that cannot order.
   */
  readonly difficulty?: number
  readonly level?: Level
  readonly tags?: readonly string[]
  /** Seconds, for a listing. Derived from the notes where it is absent. */
  readonly durationSeconds?: number
  readonly provenance?: Provenance
  /**
   * Which tool and version wrote this file.
   *
   * When a class of bad scores surfaces months later, this is what says which
   * run produced them.
   */
  readonly generator?: string
}

/** Whether a licence is one the project may ship without asking anybody. */
export function isPublicDomainLicence(licence: string): boolean {
  return (PUBLIC_DOMAIN_LICENCES as readonly string[]).includes(licence)
}

/**
 * Whether this score may go in the installer.
 *
 * Used by the packaging step, which refuses a build carrying a score that
 * cannot answer. What somebody generates locally is their business; what the
 * installer carries is the project's.
 */
export function bundlingProblems(metadata: ScoreMetadata): string[] {
  const provenance = metadata.provenance

  if (provenance === undefined) {
    return [`"${metadata.title}" has no provenance, so nothing says it may be shipped`]
  }

  const problems: string[] = []
  if (provenance.source.trim() === '') {
    problems.push(`"${metadata.title}" names no source for its notes`)
  }
  if (!isPublicDomainLicence(provenance.licence)) {
    problems.push(
      `"${metadata.title}" is licensed "${provenance.licence}"; a bundled score carries one of ${PUBLIC_DOMAIN_LICENCES.join(', ')}`,
    )
  }
  return problems
}

/** Problems in the metadata itself, whether or not the score is to be bundled. */
export function validateMetadata(metadata: ScoreMetadata): string[] {
  const messages: string[] = []

  if (metadata.title.trim() === '') {
    messages.push('a score needs a title; it is the one field a library cannot do without')
  }
  if (
    metadata.difficulty !== undefined &&
    (!Number.isFinite(metadata.difficulty) || metadata.difficulty < 1 || metadata.difficulty > 10)
  ) {
    messages.push(`difficulty is ${String(metadata.difficulty)}; it runs from 1 to 10`)
  }
  if (metadata.durationSeconds !== undefined && metadata.durationSeconds < 0) {
    messages.push(`durationSeconds is ${String(metadata.durationSeconds)}, which is not a duration`)
  }
  for (const tag of metadata.tags ?? []) {
    if (tag.trim() === '') {
      messages.push('a tag is empty; a tag people filter on has to say something')
    }
  }

  return messages
}

export type LibraryFilter = {
  readonly text?: string
  readonly level?: Level
  readonly composer?: string
  readonly tags?: readonly string[]
}

/**
 * Whether a score matches what somebody is looking for.
 *
 * Text matches title or composer, because those are what people remember. Tags
 * are all-of rather than any-of: adding a tag to a search narrows it, which is
 * what everyone expects a filter to do.
 */
export function matchesFilter(metadata: ScoreMetadata, filter: LibraryFilter): boolean {
  const text = filter.text?.trim().toLowerCase()
  if (text !== undefined && text !== '') {
    const haystack = `${metadata.title} ${metadata.composer ?? ''}`.toLowerCase()
    if (!haystack.includes(text)) {
      return false
    }
  }

  if (filter.level !== undefined && metadata.level !== filter.level) {
    return false
  }

  if (filter.composer !== undefined) {
    const composer = metadata.composer?.toLowerCase() ?? ''
    if (!composer.includes(filter.composer.toLowerCase())) {
      return false
    }
  }

  if (filter.tags !== undefined && filter.tags.length > 0) {
    const tags = new Set((metadata.tags ?? []).map((tag) => tag.toLowerCase()))
    if (!filter.tags.every((tag) => tags.has(tag.toLowerCase()))) {
      return false
    }
  }

  return true
}

/** Sort for a listing: by level, then by how hard it is inside that level, then by title. */
export function compareForLibrary(a: ScoreMetadata, b: ScoreMetadata): number {
  const levelOrder: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 }
  const levelA = a.level === undefined ? 3 : (levelOrder[a.level] ?? 3)
  const levelB = b.level === undefined ? 3 : (levelOrder[b.level] ?? 3)
  if (levelA !== levelB) {
    return levelA - levelB
  }
  const hardA = a.difficulty ?? 0
  const hardB = b.difficulty ?? 0
  if (hardA !== hardB) {
    return hardA - hardB
  }
  return a.title.localeCompare(b.title)
}
