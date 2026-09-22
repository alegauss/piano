import { resolve } from 'node:path'

import type { LibraryCorrectRequest, LibraryCorrectResult } from '@piano/ipc'
import { libraryIdOf, type Library, type LibraryEntry } from '@piano/library'

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
 * Where it writes it back is this module's question. A score is addressed by
 * the id its own metadata gives it, so a piece with an id keeps it however it
 * is retitled, and a piece without one is addressed by its title — retitling
 * that is a move, or the panel would show one name, the folder another, and a
 * model would open it by the id it had. The new name may be somebody else's,
 * and then it is exactly the clash filing knows how to ask about: file it
 * beside, or replace what is there. Nothing is written until that is answered.
 *
 * Main also holds which file the window has open, so it is main that says
 * whether this was that piece, and main that follows the file when it moves —
 * a keep written into the name a piece used to have would go to a file
 * nothing reads.
 */

/** What correcting needs of the library, so a test needs no disk to exercise it. */
export type Correcting = Pick<Library, 'correct' | 'held' | 'free'>

/** The file the window has open, which a move has to be told about. */
export type OpenScore = {
  readonly held: () => string | null
  readonly moved: (path: string) => void
}

/**
 * Where the corrected piece goes: an id to write it under, or the question
 * that has to be answered before anything is written.
 */
async function destination(
  request: LibraryCorrectRequest,
  held: LibraryEntry,
  library: Correcting,
): Promise<string | Extract<LibraryCorrectResult, { kind: 'taken' }>> {
  // What the corrected piece asks to be filed under: its own id where it has
  // one, and otherwise the name its new title gives it.
  const wanted = libraryIdOf({ ...held.metadata, ...request.metadata })
  if (wanted === request.id) {
    return wanted
  }
  const clash = request.taken === 'replace' ? null : await library.held(wanted)
  if (clash !== null && request.taken === undefined) {
    return {
      kind: 'taken',
      id: wanted,
      held: {
        title: clash.metadata.title,
        ...(clash.metadata.composer === undefined ? {} : { composer: clash.metadata.composer }),
        seconds: clash.seconds,
      },
    }
  }
  // Beside an id nothing holds is the id itself, so the choice costs nothing
  // where the clash was answered by deleting the other piece first.
  return request.taken === 'beside' ? await library.free(wanted) : wanted
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
    const held = await library.held(request.id)
    if (held === null) {
      return { kind: 'refused', message: `nothing is filed as ${request.id} any more` }
    }

    const under = await destination(request, held, library)
    if (typeof under !== 'string') {
      return under
    }

    const was = open.held()
    const corrected = await library.correct(request.id, request.metadata, under)
    if (corrected === null) {
      return { kind: 'refused', message: `nothing is filed as ${request.id} any more` }
    }
    const mine = was !== null && sameFile(was, held.file)
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
