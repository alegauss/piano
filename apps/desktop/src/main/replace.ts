import { rename } from 'node:fs/promises'

/**
 * Moving a file or folder into place, the last step of every write here that
 * must not leave half of itself behind.
 *
 * On Windows a rename onto a file that another process has just opened — the
 * antivirus scanning what was written a moment ago, the search indexer — is
 * refused with EPERM, EBUSY or EACCES, and succeeds a few milliseconds later.
 * Failing the write for it would lose a setting over nothing, so those three
 * are tried again for a little while; anything else fails at once.
 */

const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES'])

/** How long, all told, a refused rename is tried again for. */
const PATIENCE_MS = 2000

export async function replace(
  from: string,
  to: string,
  move: (from: string, to: string) => Promise<void> = rename,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<void> {
  let waited = 0
  for (let delay = 10; ; delay = Math.min(delay * 2, 200)) {
    try {
      await move(from, to)
      return
    } catch (error: unknown) {
      const code = (error as { code?: unknown }).code
      if (typeof code !== 'string' || !TRANSIENT.has(code) || waited >= PATIENCE_MS) {
        throw error
      }
      await wait(delay)
      waited += delay
    }
  }
}
