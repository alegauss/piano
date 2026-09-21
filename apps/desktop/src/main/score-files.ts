import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'

import { LIBRARY_DIRECTORY, libraryFileName, type OpenResult } from '@piano/ipc'
import { importMidi, parseScore, type Score } from '@piano/score-format'

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

/** What each extension is read as. Anything else is refused before it is read. */
const KINDS: Readonly<Record<string, 'json' | 'midi'>> = {
  '.json': 'json',
  '.mid': 'midi',
  '.midi': 'midi',
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

/** Read one file as a score, validating it the one way every route does. */
export async function openScoreFile(path: string): Promise<Opened | Refused> {
  const name = basename(path)
  const kind = KINDS[extname(path).toLowerCase()]
  if (kind === undefined) {
    return refused(name, `${name} is not a score: open a .json score or a .mid file.`)
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

  if (kind === 'midi') {
    const imported = importMidi(new Uint8Array(bytes), { title: titleOf(name) })
    if (!imported.ok) {
      return refused(name, `${name} is not a MIDI file this app can read: ${imported.message}`)
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

/** The file a library id names, which is inside the library whatever the id says. */
export function libraryPath(root: string, id: string): string {
  return join(root, libraryFileName(id))
}

/**
 * The score a command line asks to open, if it asks for one.
 *
 * A double-click in the file manager starts the app with the file as an
 * argument; a second launch hands the first its whole command line. Flags and
 * the app's own path are not files to open, so the last argument that names a
 * score or a MIDI file is the one, resolved from where the launch happened.
 */
export function launchPath(argv: readonly string[], cwd: string): string | null {
  const found = argv
    .slice(1)
    .filter((arg) => !arg.startsWith('-') && isOpenable(arg))
    .at(-1)
  return found === undefined ? null : resolve(cwd, found)
}
