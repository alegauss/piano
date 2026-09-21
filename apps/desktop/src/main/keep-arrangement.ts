import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'

import type { KeepResult } from '@piano/ipc'
import {
  arrangementSchema,
  keepArrangement,
  notesOf,
  parseScore,
  withoutStaleRulesWork,
} from '@piano/score-format'

import { replace } from './replace'

/**
 * Keeping a worked-out arrangement in the score's own file.
 *
 * The rules hand back an arrangement that names the notes it leaves out, so a
 * person or Claude Code can read it, argue with it and correct one line of it
 * — but only once it is written down. This writes it into the file the window
 * has open, signed as the rules' work, as an ordinary save: validated, and
 * put in place whole. From then on the score's own arrangement is what the
 * level plays, and a correction made to it stays made.
 *
 * The rules replace their own untouched work and never a person's; a score
 * that already has an arrangement of its own for the level keeps it.
 */

export type KeepFiles = {
  readonly read: (path: string) => Promise<string>
  readonly write: (path: string, text: string) => Promise<void>
}

const nodeFiles: KeepFiles = {
  read: (path) => readFile(path, 'utf8'),
  write: async (path, text) => {
    const partial = `${path}.partial`
    await writeFile(partial, text, 'utf8')
    await replace(partial, path)
  },
}

const refused = (message: string): KeepResult => ({ kind: 'refused', message })

export async function keepInFile(
  path: string | null,
  raw: unknown,
  files: KeepFiles = nodeFiles,
): Promise<KeepResult> {
  if (path === null) {
    return refused(
      'this piece has no file of its own to keep it in; open it from a file or the library',
    )
  }
  if (extname(path).toLowerCase() !== '.json') {
    return refused('a MIDI file has nowhere to keep an arrangement; it needs to be a score file')
  }
  const proposal = arrangementSchema.safeParse(raw)
  if (!proposal.success) {
    return refused('that is not an arrangement the score format can hold')
  }

  let text: string
  try {
    text = await files.read(path)
  } catch {
    return refused(`${basename(path)} is not there any more`)
  }
  let current: unknown
  try {
    current = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  } catch {
    return refused(`${basename(path)} is no longer a score the app can open`)
  }
  const parsed = parseScore(current)
  if (!parsed.ok) {
    return refused(`${basename(path)} no longer opens: ${parsed.message}`)
  }

  const kept = keepArrangement(parsed.score.arrangements ?? [], proposal.data)
  if (!kept.kept) {
    return refused(kept.reason)
  }
  // Signed as the rules' work, one naming notes the file does not carry would
  // be set aside by the next read rather than refused by it, and the keep
  // would answer kept having kept nothing. So it is asked about here.
  if (withoutStaleRulesWork(kept.arrangements, notesOf(parsed.score)).setAside.length > 0) {
    return refused(`it names notes ${basename(path)} does not have; open the file again first`)
  }
  // The whole score again, so anything else that does not fit is refused
  // here rather than written.
  const next = parseScore({ ...parsed.score, arrangements: kept.arrangements })
  if (!next.ok) {
    return refused(`the arrangement does not fit this score: ${next.message}`)
  }
  await files.write(path, `${JSON.stringify(next.score, null, 2)}\n`)
  return { kind: 'kept', name: basename(path), score: next.score }
}
