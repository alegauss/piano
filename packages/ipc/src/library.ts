/**
 * Where the library of scores lives, and what a score in it is called.
 *
 * The MCP server writes the library and the app opens from it, so the name a
 * tool call saves a score under and the file the window then opens have to be
 * worked out by one function. Two copies of this would agree until one of them
 * learned a new rule, and a score saved by Claude Code would then be one the
 * window cannot find.
 */

/** Where the library is kept, under the person's home directory. */
export const LIBRARY_DIRECTORY = ['.piano', 'library'] as const

/** How the file for a score is named, so a listing can find it again. */
export const SCORE_SUFFIX = '.score.json'

/** Long enough for a title, short enough to stay a file name everywhere. */
const MAX_NAME = 64

/** The names Windows reserves for devices, which no file may take. */
const WINDOWS_DEVICES = /^(con|prn|aux|nul|com\d|lpt\d)$/

/**
 * A name reduced to what a file system and a URL both accept.
 *
 * Everything else goes, rather than being escaped: an id is an address and not
 * a title, and the one thing it must never do is climb out of the library.
 */
export function safeName(name: string): string {
  const reduced = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_NAME)
    .replace(/^-+/, '')
    .replace(/-+$/, '')
  if (reduced === '') {
    return 'score'
  }
  // Windows keeps these names for devices whatever follows them: a score
  // called "con" written as con.score.json is a write to the console.
  return WINDOWS_DEVICES.test(reduced) ? `${reduced}-score` : reduced
}

/** The file a library id is kept in, inside the library and nowhere else. */
export function libraryFileName(id: string): string {
  return `${safeName(id)}${SCORE_SUFFIX}`
}
