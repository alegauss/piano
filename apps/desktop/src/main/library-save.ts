import type { LibrarySaveResult } from '@piano/ipc'
import type { Library } from '@piano/library'
import { parseScore } from '@piano/score-format'

/**
 * Filing the open score in the library, which is the write the window never had.
 *
 * Until now the library had one writer and it was not the app: the MCP server
 * saved into it and the window only read. So a MIDI or MusicXML file opened
 * here was imported into memory and nowhere else, and closing the window meant
 * doing the import again — guesses and all — from the original file.
 *
 * The window sends the score it is showing, whole: the arrangements and the
 * metadata an import worked out travel with it, which is what Save as MIDI
 * cannot carry. Main validates it again, because it came from the renderer,
 * and then hands it to the same `library.save` a model's save goes through, so
 * there is one writer and not two. Nothing here takes a path: where a piece
 * goes is the library's own answer, from the id in the score's metadata.
 *
 * A piece filed under an id the library already holds replaces it, as a save
 * from Claude Code does. That is right for a model correcting a piece it just
 * wrote and wrong for two unrelated imports that share a title, which is PI95.
 */

/** What filing needs of the library, so a test needs no disk to exercise it. */
export type Filing = Pick<Library, 'save'>

export async function fileInLibrary(raw: unknown, library: Filing): Promise<LibrarySaveResult> {
  const parsed = parseScore(raw)
  if (!parsed.ok) {
    return {
      kind: 'refused',
      message: `this is not a score the library can hold: ${parsed.message}`,
    }
  }
  try {
    const saved = await library.save(parsed.score)
    return { kind: 'filed', id: saved.id, title: saved.score.metadata.title }
  } catch (error: unknown) {
    return {
      kind: 'refused',
      message: `the library could not be written: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
