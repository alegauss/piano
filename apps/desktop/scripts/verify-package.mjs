import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { electronEnv } from './electron.mjs'

/**
 * Start what electron-builder just produced, and refuse to call it a build
 * until it opens.
 *
 * This exists because of a failure that shipped quietly: with node_modules in
 * the archive, the asar came out with a package.json that was not JSON, and
 * the app exited immediately with no window, no message and no non-zero
 * anything that a build log would show. The installer was produced, it was the
 * right size, and it did not work. So the packaging step now ends by running
 * the thing it made.
 */

const releaseDir = fileURLToPath(new URL('../../../release', import.meta.url))

/**
 * Where each platform's unpacked binary lands.
 *
 * @type {Partial<Record<NodeJS.Platform, string>>}
 */
const BINARIES = {
  win32: join(releaseDir, 'win-unpacked', 'Piano.exe'),
  linux: join(releaseDir, 'linux-unpacked', 'piano'),
  darwin: join(releaseDir, 'mac', 'Piano.app', 'Contents', 'MacOS', 'Piano'),
}

const binary = BINARIES[process.platform]

if (binary === undefined) {
  process.stderr.write(`verify: no unpacked binary is known for ${process.platform}\n`)
  process.exit(1)
}

try {
  await access(binary)
} catch {
  process.stderr.write(`verify: nothing at ${binary}; run \`npm run package\` first\n`)
  process.exit(1)
}

const child = spawn(binary, [], {
  env: electronEnv({
    PIANO_SMOKE: '1',
    // Its own profile: verifying a build must not touch an installed app's.
    PIANO_USER_DATA_DIR: join(releaseDir, '.verify-profile'),
  }),
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stdout = ''
let stderr = ''
child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')
child.stdout.on('data', (chunk) => (stdout += chunk))
child.stderr.on('data', (chunk) => (stderr += chunk))

child.on('exit', (code) => {
  if (code !== 0 || !stdout.includes('renderer loaded')) {
    process.stderr.write(
      `verify: the packaged app did not start (exit ${String(code)})\n${stdout}${stderr}`,
    )
    process.exit(1)
  }
  process.stdout.write('verify: the packaged app starts and loads its renderer\n')
})
