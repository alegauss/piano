import { spawn } from 'node:child_process'

import { electronEnv, electronPath } from './electron.mjs'
import { appDir } from './esbuild.options.mjs'

const EXPECTED = 'piano: renderer loaded'

/**
 * Start the built app, wait for the renderer to report itself, and exit with
 * whatever electron exited with. This is how "the window opens" is checked
 * without a human watching for it.
 */
const electron = spawn(electronPath, ['.'], {
  cwd: appDir,
  env: electronEnv({ PIANO_SMOKE: '1' }),
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stdout = ''
let stderr = ''

electron.stdout.setEncoding('utf8')
electron.stderr.setEncoding('utf8')
electron.stdout.on('data', (chunk) => {
  stdout += chunk
})
electron.stderr.on('data', (chunk) => {
  stderr += chunk
})

electron.on('exit', (code) => {
  if (code !== 0) {
    process.stderr.write(`smoke: electron exited with ${String(code)}\n${stderr}`)
    process.exit(1)
  }
  if (!stdout.includes(EXPECTED)) {
    process.stderr.write(`smoke: electron never reported "${EXPECTED}"\n${stdout}${stderr}`)
    process.exit(1)
  }
  process.stdout.write('smoke: the window opened and the renderer loaded\n')
})
