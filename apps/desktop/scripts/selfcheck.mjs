import { spawn } from 'node:child_process'
import { join } from 'node:path'

import { electronEnv, electronPath } from './electron.mjs'
import { appDir } from './esbuild.options.mjs'

/**
 * Run the assertions that need a real Electron process: that the renderer can
 * reach nothing, and that every IPC channel refuses a malformed payload.
 *
 * A unit test cannot answer either question. Whether `require` is reachable
 * depends on the sandbox, on contextIsolation and on what the preload exposed,
 * and none of those exist outside a running app. So the checks live in main,
 * behind PIANO_SELFCHECK, and this script reads their verdict.
 */
const selfCheckUserDataDir = join(appDir, '.selfcheck-profile')

const electron = spawn(electronPath, ['.'], {
  cwd: appDir,
  env: electronEnv({ PIANO_SELFCHECK: '1', PIANO_USER_DATA_DIR: selfCheckUserDataDir }),
  stdio: ['ignore', 'inherit', 'inherit'],
})

electron.on('exit', (code) => {
  if (code !== 0) {
    process.stderr.write(`selfcheck: failed (electron exited with ${String(code)})\n`)
    process.exit(1)
  }
})
