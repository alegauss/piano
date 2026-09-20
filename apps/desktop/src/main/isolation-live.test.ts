import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * The questions that only a running Electron can answer.
 *
 * Whether the renderer can reach `require` depends on the sandbox, on
 * contextIsolation and on what the preload exposed — none of which exist
 * outside the app. So this starts the built app in self-check mode and reads
 * its verdict, rather than asserting about a configuration object and calling
 * that a security test.
 */

const appDir = fileURLToPath(new URL('../..', import.meta.url))

type SelfCheckRun = {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

async function runSelfCheck(): Promise<SelfCheckRun> {
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const electronPath = require('electron') as unknown as string

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PIANO_SELFCHECK: '1',
    PIANO_USER_DATA_DIR: join(appDir, '.test-profile'),
  }
  // Inherited from an editor's terminal, this turns electron into plain node:
  // no window, no error, exit 0. See scripts/electron.mjs.
  delete env['ELECTRON_RUN_AS_NODE']

  return new Promise((resolve, reject) => {
    const child = spawn(electronPath, ['.'], {
      cwd: appDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => (stdout += chunk))
    child.stderr.on('data', (chunk: string) => (stderr += chunk))
    child.on('error', reject)
    child.on('exit', (code) => {
      resolve({ code, stdout, stderr })
    })
  })
}

describe('the app, running', () => {
  it('passes every self-check', async () => {
    const run = await runSelfCheck()

    const failures = run.stdout
      .split('\n')
      .filter((line) => line.startsWith('FAIL'))
      .join('\n')

    expect(failures, `self-checks failed:\n${failures}`).toBe('')
    expect(run.stdout).toMatch(/piano: self-check (\d+)\/\1 passed/)
    expect(run.code, run.stderr).toBe(0)
  })

  it('reports the renderer as sealed off and the bridge as present', async () => {
    const run = await runSelfCheck()
    expect(run.stdout).toContain('pass  the renderer cannot reach require, process or fs')
    expect(run.stdout).toContain('pass  the bridge is exposed')
    expect(run.stdout).toContain('pass  every declared channel is registered')
  })
})
