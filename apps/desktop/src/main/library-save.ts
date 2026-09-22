import type { LibrarySaveRequest, LibrarySaveResult } from '@piano/ipc'
import { libraryId, type Library } from '@piano/library'
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
 * What is added on this side is the question `library.save` does not ask. A
 * model saving a correction means the id it wrote before and wants it
 * overwritten; an import means whatever a track name happened to say, which is
 * often Untitled, so the second download would replace the first with nothing
 * said. So a taken id is answered rather than written, and the window comes
 * back with the choice: beside, which numbers the id and writes it into the
 * score so file and metadata agree from then on, or replace, which is the old
 * behaviour asked for deliberately.
 */

/** What filing needs of the library, so a test needs no disk to exercise it. */
export type Filing = Pick<Library, 'save' | 'held' | 'free'>

export async function fileInLibrary(
  request: LibrarySaveRequest,
  library: Filing,
): Promise<LibrarySaveResult> {
  const parsed = parseScore(request.score)
  if (!parsed.ok) {
    return {
      kind: 'refused',
      message: `this is not a score the library can hold: ${parsed.message}`,
    }
  }
  const score = parsed.score

  try {
    const wanted = libraryId(score)
    const held = request.taken === 'replace' ? null : await library.held(wanted)
    if (held !== null && request.taken === undefined) {
      return {
        kind: 'taken',
        id: wanted,
        held: {
          title: held.metadata.title,
          ...(held.metadata.composer === undefined ? {} : { composer: held.metadata.composer }),
          seconds: held.seconds,
        },
      }
    }
    // Beside an id nothing holds is the id itself, so the choice costs nothing
    // where the clash was answered by somebody deleting the other piece first.
    const filed =
      request.taken === 'beside'
        ? { ...score, metadata: { ...score.metadata, id: await library.free(wanted) } }
        : score
    const saved = await library.save(filed)
    return { kind: 'filed', id: saved.id, title: saved.score.metadata.title }
  } catch (error: unknown) {
    return {
      kind: 'refused',
      message: `the library could not be written: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
