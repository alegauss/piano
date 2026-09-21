import type { ExportRequest, ExportResult } from '@piano/ipc'
import { exportMidi, parseScore } from '@piano/score-format'

/**
 * Saving the open score as a MIDI file, which is the way into a DAW that the
 * recording non-goal promises.
 *
 * The window sends the score it is showing, at the level chosen, since that
 * is what somebody has been hearing; main checks it again, because it comes
 * from the renderer, asks where to put it with a name made from the title,
 * and writes what exportMidi makes of it. What a MIDI file has nowhere to put
 * — fingerings, spellings, sections — comes back as sentences to tell the
 * person after the save, never as a question to answer before it.
 */

export type ExportDeps = {
  /** Ask where to save, suggesting a name; null when the person closed the dialog. */
  readonly choose: (suggested: string) => Promise<string | null>
  readonly write: (path: string, bytes: Uint8Array) => Promise<void>
}

/** Characters no file name may hold on one platform or another, besides the control ones. */
const UNSAFE = /[<>:"/\\|?*]+/g

/** The file a score is suggested to be saved as: its title, and the level where it is not as written. */
export function midiFileName(title: string, level: ExportRequest['level']): string {
  const printable = [...title].map((char) => (char.charCodeAt(0) < 32 ? ' ' : char)).join('')
  const base = printable.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Score'
  return `${base}${level === null ? '' : ` (${level})`}.mid`
}

export async function exportScore(request: ExportRequest, deps: ExportDeps): Promise<ExportResult> {
  const parsed = parseScore(request.score)
  if (!parsed.ok) {
    return { kind: 'refused', message: parsed.message }
  }
  const midi = exportMidi(parsed.score)
  const path = await deps.choose(midiFileName(parsed.score.metadata.title, request.level))
  if (path === null) {
    return { kind: 'cancelled' }
  }
  try {
    await deps.write(path, midi.bytes)
  } catch (error: unknown) {
    return {
      kind: 'refused',
      message: `the file could not be written: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  const name = path.split(/[\\/]/).at(-1) ?? path
  return { kind: 'saved', name, dropped: [...midi.dropped] }
}
