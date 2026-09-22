import { resolve } from 'node:path'

import type { LibraryRemoveRequest, LibraryRemoveResult } from '@piano/ipc'
import type { Library } from '@piano/library'

import type { Recent } from './recent'

/**
 * Taking a piece out of the library.
 *
 * A library that only grows fills up with mistakes: the import that came in
 * twice, the download that turned out to be a drum track, the piece filed as
 * Untitled before anybody knew what it was. Until now the only way out was the
 * file manager — find the folder under the home directory, work out which
 * `.piano` file is which from names already reduced to lower case and hyphens,
 * and delete it there.
 *
 * The window sends the id its row names the piece by, and nothing else. Where
 * the file goes is the library's own answer, as it is for every other write,
 * and the library takes it away through the host's own way of taking a file
 * away — which in this app is the system's bin. A wrong click is then
 * answerable without this app growing a bin of its own.
 *
 * An id nothing is filed under is refused rather than shrugged off: the row
 * said there was a piece there, so a listing and the disk disagree, and
 * somebody watching a row vanish for the wrong reason is owed the sentence.
 *
 * The other door into a piece closes here too. The recent list is a cache of
 * paths, written as a score opens and never read again, so an entry naming a
 * file that has just gone to the bin is one that fails when it is picked.
 */

/** What removing needs of the library, so a test needs no disk to exercise it. */
export type Removing = Pick<Library, 'remove' | 'held'>

/** The recent list, which offers a piece by the file it was opened from. */
export type Recently = Pick<Recent, 'dropped'>

export async function removeFromLibrary(
  request: LibraryRemoveRequest,
  library: Removing,
  recent: Recently,
): Promise<LibraryRemoveResult> {
  try {
    // Asked before the write, because afterwards there is no file to ask about.
    const was = await library.held(request.id)
    const held = await library.remove(request.id)
    if (!held) {
      return { kind: 'refused', message: `nothing is filed as ${request.id}` }
    }
    if (was !== null) {
      // The menu would go on offering it, and answer that it is not there any
      // more — true, and not what anybody picked it for.
      await recent.dropped(resolve(was.file))
    }
    return { kind: 'removed', id: request.id }
  } catch (error: unknown) {
    return {
      kind: 'refused',
      message: `it could not be taken out of the library: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
