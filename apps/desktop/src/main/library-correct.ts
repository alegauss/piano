import { resolve } from 'node:path'

import type { LibraryCorrectRequest, LibraryCorrectResult } from '@piano/ipc'
import type { Library } from '@piano/library'

import { samePath } from './recent'

/**
 * Correcting what a filed piece says about itself.
 *
 * Filing asks once, as a file comes in, and until now that was the only time
 * anybody could answer: a MIDI file whose track name became a title, a level
 * nobody picked, a composer invented by an importer — all of it was fixed by
 * asking a model to write the whole score again. Three calls that can
 * half-fail, in place of one that cannot, and every one of them a chance to
 * lose a bar while fixing a word.
 *
 * The window sends the id its row names the piece by and the five fields the
 * form holds. It does not send a score: the notes are not in question, and a
 * payload carrying them would be a way to rewrite a piece through a form that
 * asks about its title. The library reads the piece, replaces those fields,
 * validates the result against the schema the app opens by, and writes it
 * back.
 *
 * Where it writes it back is not this module's question: retitling a piece
 * that has no id of its own moves it, the name it wants may be somebody
 * else's, and all of that is the library's, because the other caller is a
 * model and a rule kept in two places is soon two rules. This module carries
 * the answers across the bridge in the shapes the contract declares.
 *
 * What is main's alone is which file the window has open, so it is main that
 * says whether this was that piece, and main that follows the file when it
 * moves — a keep written into the name a piece used to have would go to a
 * file nothing reads.
 */

/** What correcting needs of the library, so a test needs no disk to exercise it. */
export type Correcting = Pick<Library, 'correct' | 'held'>

/** The file the window has open, which a move has to be told about. */
export type OpenScore = {
  readonly held: () => string | null
  readonly moved: (path: string) => void
}

/** Whether two paths name one file, allowing for how each of them was spelled. */
function sameFile(one: string, other: string): boolean {
  return samePath(resolve(one), resolve(other))
}

export async function correctInLibrary(
  request: LibraryCorrectRequest,
  library: Correcting,
  open: OpenScore,
): Promise<LibraryCorrectResult> {
  try {
    // Asked before the write, because after it the piece may be under another
    // name and this is the only chance to know which file it was.
    const was = await library.held(request.id)
    const corrected = await library.correct(request.id, request.metadata, request.taken)
    if (corrected.kind === 'missing') {
      return { kind: 'refused', message: `nothing is filed as ${request.id} any more` }
    }
    if (corrected.kind === 'taken') {
      return {
        kind: 'taken',
        id: corrected.id,
        held: {
          title: corrected.held.metadata.title,
          ...(corrected.held.metadata.composer === undefined
            ? {}
            : { composer: corrected.held.metadata.composer }),
          seconds: corrected.held.seconds,
        },
      }
    }
    const here = open.held()
    const mine = here !== null && was !== null && sameFile(here, was.file)
    if (mine) {
      open.moved(corrected.file)
    }
    return {
      kind: 'corrected',
      id: corrected.id,
      title: corrected.score.metadata.title,
      score: corrected.score,
      open: mine,
    }
  } catch (error: unknown) {
    return {
      kind: 'refused',
      message: `the library could not be written: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
