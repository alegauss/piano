import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

import {
  LIBRARY_DIRECTORY,
  libraryFileName,
  libraryFileNames,
  type LibraryItem,
  type OpenResult,
} from '@piano/ipc'
import type { LibraryEntry } from '@piano/library'
import {
  importMidi,
  importMusicXml,
  musicXmlText,
  MusicXmlError,
  parseScore,
  type InflateRaw,
  type Score,
} from '@piano/score-format'

/**
 * Reading a score off the disk, which every way of opening one comes through.
 *
 * A dialog, a drop, the recent list, a double-click in the file manager and a
 * tool call naming a library score all end here, so a malformed file reads the
 * same however it arrived and none of them can grow a check the others lack.
 * A file is read and validated before anything else is touched: what leaves
 * this module is a score the format accepted, or the reasons it was refused.
 */

/** Far more than any piece; a file this size is a mistake, and reading it would stall the app. */
export const MAX_SCORE_BYTES = 16 * 1024 * 1024

const BYTE_ORDER_MARK = 0xfeff

/** How many problems cross to the window: enough to act on, not a flood. */
const MAX_PROBLEMS = 50

/**
 * What each extension is read as. Anything else is refused before it is read.
 * A score is JSON whichever it is called: `.piano` is the name the system
 * hands to the app, and `.json` is what a score written anywhere else is.
 * `.xml` is here because that is what half the sites handing out MusicXML call
 * it; one that turns out to be some other XML is refused by name.
 */
const KINDS: Readonly<Record<string, 'json' | 'midi' | 'musicxml'>> = {
  '.piano': 'json',
  '.json': 'json',
  '.mid': 'midi',
  '.midi': 'midi',
  '.musicxml': 'musicxml',
  '.mxl': 'musicxml',
  '.xml': 'musicxml',
}

/**
 * Unpacking a .mxl, which is a zip.
 *
 * The format package holds the container layout and refuses to hold DEFLATE:
 * it runs in the renderer too, where there is no zlib, and a hand-written
 * inflate that is subtly wrong corrupts a score rather than refusing it. So
 * the one process that reads files off disk supplies the one the platform
 * already ships.
 */
const inflateRaw: InflateRaw = (deflated, expanded) =>
  inflateRawSync(deflated, { maxOutputLength: Math.max(expanded, MAX_SCORE_BYTES) })

/** Whether a path names a score file, as opposed to a MIDI file, which has nowhere to keep more. */
export function isScoreFile(path: string): boolean {
  return KINDS[extname(path).toLowerCase()] === 'json'
}

/** Whether a path names a file this app opens, by what it is called. */
export function isOpenable(path: string): boolean {
  return KINDS[extname(path).toLowerCase()] !== undefined
}

/** An open that succeeded, with the score typed, before it becomes a message. */
export type Opened = Extract<OpenResult, { kind: 'opened' }> & { readonly score: Score }
export type Refused = Extract<OpenResult, { kind: 'refused' }>

function refused(name: string, message: string): Refused {
  return { kind: 'refused', name, message, problems: [] }
}

/** What a MIDI file's name says the piece is called, when nothing inside it does. */
function titleOf(name: string): string {
  return name
    .slice(0, name.length - extname(name).length)
    .replace(/[_-]+/g, ' ')
    .trim()
}

/**
 * An import as the two of them answer alike: the score, or the sentence saying
 * why not. Unwrapping a .mxl can fail before the import starts, and a failure
 * there reads the same as one inside it.
 */
type Imported =
  | {
      readonly ok: true
      readonly score: Score
      readonly inferred: readonly string[]
      readonly dropped: readonly string[]
    }
  | { readonly ok: false; readonly message: string }

function readImport(kind: 'midi' | 'musicxml', bytes: Uint8Array, name: string): Imported {
  if (kind === 'midi') {
    return importMidi(bytes, { title: titleOf(name) })
  }
  try {
    return importMusicXml(musicXmlText(bytes, inflateRaw), { title: titleOf(name) })
  } catch (error: unknown) {
    if (error instanceof MusicXmlError) {
      return { ok: false, message: error.message }
    }
    return { ok: false, message: 'it could not be unpacked' }
  }
}

/** Read one file as a score, validating it the one way every route does. */
export async function openScoreFile(path: string): Promise<Opened | Refused> {
  const name = basename(path)
  const kind = KINDS[extname(path).toLowerCase()]
  if (kind === undefined) {
    return refused(
      name,
      `${name} is not a score: open a .piano or .json score, a .mid file, or MusicXML as .musicxml, .mxl or .xml.`,
    )
  }

  let size: number
  try {
    const found = await stat(path)
    if (!found.isFile()) {
      return refused(name, `${name} is a folder, not a score.`)
    }
    size = found.size
  } catch {
    return refused(name, `${name} is not there any more, or cannot be read.`)
  }
  if (size > MAX_SCORE_BYTES) {
    const megabytes = Math.round(size / (1024 * 1024))
    return refused(
      name,
      `${name} is ${String(megabytes)} MB, far more than any score, so it was left alone.`,
    )
  }

  let bytes: Buffer
  try {
    bytes = await readFile(path)
  } catch {
    return refused(name, `${name} could not be read.`)
  }

  if (kind === 'midi' || kind === 'musicxml') {
    const imported = readImport(kind, new Uint8Array(bytes), name)
    if (!imported.ok) {
      const what = kind === 'midi' ? 'a MIDI file' : 'MusicXML'
      return refused(name, `${name} is not ${what} this app can read: ${imported.message}`)
    }
    return {
      kind: 'opened',
      name,
      score: imported.score,
      notices: [
        ...imported.inferred.map((line) => `Guessed: ${line}`),
        ...imported.dropped.map((line) => `Left out: ${line}`),
      ],
    }
  }

  let raw: unknown
  try {
    // A byte-order mark is what some editors put first; it is not JSON, and not a reason to refuse.
    const text = bytes.toString('utf8')
    raw = JSON.parse(text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text)
  } catch (error: unknown) {
    const why = error instanceof Error ? error.message : String(error)
    return refused(name, `${name} is not JSON, so it cannot be a score: ${why}`)
  }
  const parsed = parseScore(raw)
  if (!parsed.ok) {
    return {
      kind: 'refused',
      name,
      message: parsed.message,
      problems: parsed.problems.slice(0, MAX_PROBLEMS).map((problem) => ({ ...problem })),
    }
  }
  return { kind: 'opened', name, score: parsed.score, notices: [...parsed.migrated] }
}

/** Where the library is: the same place the MCP server writes it. */
export function libraryRoot(env: NodeJS.ProcessEnv = process.env): string {
  const named = env['PIANO_LIBRARY']
  return named !== undefined && named.trim() !== '' ? named : join(homedir(), ...LIBRARY_DIRECTORY)
}

/** A library entry as the window lists it: the metadata a row shows, and nothing the row does not. */
export function libraryItem(entry: LibraryEntry): LibraryItem {
  const { metadata } = entry
  return {
    id: entry.id,
    title: metadata.title,
    ...(metadata.composer === undefined ? {} : { composer: metadata.composer }),
    ...(metadata.level === undefined ? {} : { level: metadata.level }),
    ...(metadata.difficulty === undefined ? {} : { difficulty: metadata.difficulty }),
    tags: [...(metadata.tags ?? [])],
    seconds: entry.seconds,
    added: entry.added,
  }
}

/**
 * The file a library id names, which is inside the library whatever the id
 * says: the one it is kept in now, where a score saved before the suffix
 * changed has not moved yet, and the name it is written under otherwise.
 */
export function libraryPath(
  root: string,
  id: string,
  exists: (path: string) => boolean = existsSync,
): string {
  const kept = libraryFileNames(id)
    .map((name) => join(root, name))
    .find(exists)
  return kept ?? join(root, libraryFileName(id))
}

/**
 * The score a command line asks to open, if it asks for one.
 *
 * A double-click in the file manager starts the app with the file as an
 * argument; a second launch hands the first its whole command line. Flags and
 * the app's own path are not files to open, so the last argument that names a
 * score or a MIDI file is the one, resolved from where the launch happened.
 * A Linux desktop entry may hand the file over as a file:// URL instead.
 */
export function launchPath(argv: readonly string[], cwd: string): string | null {
  const found = argv
    .slice(1)
    .map((arg) => (arg.startsWith('file://') ? fromFileUrl(arg) : arg))
    .filter((arg) => arg !== '' && !arg.startsWith('-') && isOpenable(arg))
    .at(-1)
  return found === undefined ? null : resolve(cwd, found)
}

/** A file:// URL as the path it names, or nothing for one that names no local file. */
function fromFileUrl(url: string): string {
  try {
    return fileURLToPath(url)
  } catch {
    return ''
  }
}
