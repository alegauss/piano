import { spawn } from 'node:child_process'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * Being handed a file, which is the whole point of registering a file type.
 *
 * A registry entry or a desktop entry names the piano and hands it a path; the
 * app can still refuse that path, or open its window on the placeholder, and
 * every reading of the registration would pass. So a headless run started with
 * a score says which one it opened, and this is what asserts that it does — the
 * association check that installs the app reads the same line.
 */

const appDir = fileURLToPath(new URL('../..', import.meta.url))
const bundled = fileURLToPath(new URL('./bundled/ode-to-joy.score.json', import.meta.url))

let work = ''

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'piano-launch-'))
})

afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

type Run = { readonly code: number | null; readonly said: string }

/** The app, headless, started with whatever this passes as its one argument. */
async function startedWith(...args: string[]): Promise<Run> {
  const { createRequire } = await import('node:module')
  const electronPath = createRequire(import.meta.url)('electron') as unknown as string

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PIANO_SMOKE: '1',
    PIANO_USER_DATA_DIR: join(work, 'profile'),
  }
  // Inherited from an editor's terminal, this turns electron into plain node.
  delete env['ELECTRON_RUN_AS_NODE']

  return new Promise((resolve, reject) => {
    const child = spawn(electronPath, ['.', ...args], {
      cwd: appDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let said = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => (said += chunk))
    child.stderr.on('data', (chunk: string) => (said += chunk))
    child.on('error', reject)
    child.on('exit', (code) => {
      resolve({ code, said })
    })
  })
}

describe('the app, started with a score', () => {
  it('says which score it opened, by the name it was handed', async () => {
    const score = join(work, 'association-check.piano')
    await copyFile(bundled, score)

    const run = await startedWith(score)

    expect(run.said, run.said).toContain('piano: renderer loaded')
    expect(run.said, run.said).toContain(`piano: opened ${basename(score)}`)
    expect(run.code, run.said).toBe(0)
  })

  it('says nothing about a score when it was started with none', async () => {
    const run = await startedWith()

    expect(run.said, run.said).toContain('piano: renderer loaded')
    expect(run.said).not.toContain('piano: opened')
    expect(run.code, run.said).toBe(0)
  })
})
