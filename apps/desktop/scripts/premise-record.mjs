import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { appDir } from './esbuild.options.mjs'

/**
 * A new recording for the premise test, from a live model.
 *
 * The premise test replays what a model wrote for one request, so it runs in
 * CI without a model. This is the other half: it asks Claude Code the same
 * request through the plugin's own /piano:compose, lets the model validate
 * and save its score into a library of its own, and writes that score into
 * the recording. The next `npm run test:live` then walks the chain with what
 * a model wrote today rather than what one wrote when the test was made.
 *
 * Only the tools that check and keep a score are allowed: this run is about
 * what the model writes, and playing belongs to the test, against a window
 * of its own.
 *
 * It needs the `claude` command, signed in, and spends one request.
 */

const repoRoot = join(appDir, '..', '..')
const recordingPath = join(appDir, 'src', 'test', 'premise', 'recording.json')

/** @type {{ request: string }} */
const { request } = JSON.parse(readFileSync(recordingPath, 'utf8'))

const root = mkdtempSync(join(tmpdir(), 'piano-record-'))
const library = join(root, 'library')

// Plugin tools are named for the plugin and its server; both spellings are
// allowed so the run does not depend on which one this version uses.
const allowed = ['validate_score', 'save_score'].flatMap((tool) => [
  `mcp__plugin_piano_piano__${tool}`,
  `mcp__piano__${tool}`,
])

const run = spawnSync(
  'claude',
  [
    '-p',
    `/piano:compose ${request}`,
    '--plugin-dir',
    join(repoRoot, 'plugin'),
    '--allowedTools',
    ...allowed,
  ],
  {
    env: { ...process.env, PIANO_LIBRARY: library, PIANO_PRESENCE_DIR: join(root, 'windows') },
    stdio: 'inherit',
  },
)

try {
  if (run.error !== undefined) {
    throw new Error(`could not run claude: ${run.error.message}`)
  }
  const saved = readdirSafe(library)
    .filter((name) => name.endsWith('.score.json'))
    .map((name) => ({ name, at: statSync(join(library, name)).mtimeMs }))
    .sort((one, other) => other.at - one.at)[0]
  if (saved === undefined) {
    throw new Error('the model saved no score, so there is nothing to record')
  }
  /** @type {unknown} */
  const score = JSON.parse(readFileSync(join(library, saved.name), 'utf8'))
  const recording = {
    request,
    recordedWith: `claude -p /piano:compose on ${new Date().toISOString().slice(0, 10)}`,
    score,
  }
  writeFileSync(recordingPath, `${JSON.stringify(recording, null, 2)}\n`, 'utf8')
  process.stdout.write(`premise: recorded ${saved.name} into ${recordingPath}\n`)
} catch (error) {
  process.stderr.write(`premise: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  rmSync(root, { recursive: true, force: true })
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function readdirSafe(dir) {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}
