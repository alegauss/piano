import type { LibrarySaveResult } from '@piano/ipc'

/** Everything filing can answer except the question it asks back. */
export type Filed = Exclude<LibrarySaveResult, { kind: 'taken' }>

/**
 * What the window says after filing the open score in the library.
 *
 * Said afterwards, like the MIDI save's sentence: somebody who has just heard
 * a piece play wants it kept, not a dialog about where it is kept. The id is
 * named as well as the title, because it is what a list row and a sentence in
 * chat will both call the piece from now on — and after a clash it is the one
 * that was free rather than the one that was asked for.
 *
 * A taken id is not said here: it is a question, and it has its own dialog.
 */
export function describeFiling(result: Filed): string {
  return result.kind === 'filed'
    ? `Added ${result.title} to the library, as ${result.id}.`
    : `Could not add it to the library: ${result.message}`
}
