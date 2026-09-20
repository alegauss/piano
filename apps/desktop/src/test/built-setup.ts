import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Refuse to run the live suite against a bundle older than the source.
 *
 * A live test drives the built app, not the tree. Run after an edit and before
 * a build, it reports green about code nobody is looking at — and it does so
 * convincingly, because everything it touches really did pass. That is worse
 * than not running it, so the run stops here instead.
 */

const appDir = fileURLToPath(new URL('../..', import.meta.url))
const distDir = join(appDir, 'dist')
const srcDir = join(appDir, 'src')

/**
 * A test is not an input to the bundle. Counting one as source means editing a
 * test makes the live suite refuse to run, which trains everyone to ignore the
 * refusal — and then it stops catching the case it exists for.
 */
const NOT_BUNDLED = /(?:\.test\.[cm]?[jt]sx?|-live\.test\.[cm]?[jt]s)$/

async function newestMTime(dir: string, skipTests = false): Promise<number> {
  let newest = 0
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (skipTests && entry.name === 'test') {
        continue
      }
      newest = Math.max(newest, await newestMTime(full, skipTests))
    } else {
      if (skipTests && NOT_BUNDLED.test(entry.name)) {
        continue
      }
      newest = Math.max(newest, (await stat(full)).mtimeMs)
    }
  }
  return newest
}

export async function setup(): Promise<void> {
  let builtAt: number
  try {
    builtAt = await newestMTime(distDir)
  } catch {
    throw new Error('the live suite needs a build: run `npm run build` before `npm run test:live`')
  }

  // The test folder is excluded: editing a test must not make the bundle stale.
  const editedAt = await newestMTime(srcDir, true)

  if (editedAt > builtAt) {
    throw new Error(
      'the build is older than the source: run `npm run build`, or the live suite ' +
        'will report green about code nobody is looking at',
    )
  }
}
