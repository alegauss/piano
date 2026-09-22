import type { LibraryCorrectRequest, LibraryCorrectResult } from '@piano/ipc'
import type { Library } from '@piano/library'

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
 * So the window sends an id and the five fields the form holds. It does not
 * send a score: the notes are not in question, and a payload carrying them
 * would be a way to rewrite a piece through a form that asks about its title.
 * The library reads the piece, replaces those fields, validates the result
 * against the schema the app opens by, and writes it back under the same id.
 *
 * What comes back is the score as kept, because a window showing that piece is
 * showing what was just corrected.
 */

/** What correcting needs of the library, so a test needs no disk to exercise it. */
export type Correcting = Pick<Library, 'correct'>

export async function correctInLibrary(
  request: LibraryCorrectRequest,
  library: Correcting,
): Promise<LibraryCorrectResult> {
  try {
    const corrected = await library.correct(request.id, request.metadata)
    if (corrected === null) {
      return { kind: 'refused', message: `nothing is filed as ${request.id} any more` }
    }
    return {
      kind: 'corrected',
      id: corrected.id,
      title: corrected.score.metadata.title,
      score: corrected.score,
    }
  } catch (error: unknown) {
    return {
      kind: 'refused',
      message: `the library could not be written: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
