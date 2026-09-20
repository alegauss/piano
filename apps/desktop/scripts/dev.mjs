import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { context } from 'esbuild'
import { createServer } from 'vite'

import { electronEnv, electronPath } from './electron.mjs'
import { appDir, esbuildOptions } from './esbuild.options.mjs'

const viteConfigFile = fileURLToPath(new URL('../vite.config.mts', import.meta.url))

/**
 * A profile of its own, so a dev run never shares a cache directory with the
 * installed app or with a smoke run. Two Electron processes over one userData
 * directory is what produces the "Unable to move the cache: access denied"
 * wall of errors, and the second process loses.
 */
const devUserDataDir = join(appDir, '.dev-profile')

/** How long to wait for a burst of rebuilds to settle before restarting once. */
const RESTART_DEBOUNCE_MS = 50

/** @type {import('node:child_process').ChildProcess | null} */
let electron = null
/** True while a rebuild is deliberately killing electron, so its exit is not the user quitting. */
let restarting = false
let shuttingDown = false

/** Restarts run one at a time, chained: a second request waits rather than racing. */
let restartChain = Promise.resolve()
/** @type {NodeJS.Timeout | null} */
let restartTimer = null

const server = await createServer({ configFile: viteConfigFile })
await server.listen()

const devServerUrl = server.resolvedUrls?.local?.[0]
if (devServerUrl === undefined) {
  throw new Error('dev: vite started but reported no local url')
}

/**
 * Rebuilding main or preload restarts electron; the renderer reloads itself.
 *
 * One instance of this plugin per context, each ignoring its own first build:
 * ctx.watch() resolves when watching begins, not when the first build ends, so
 * without that the opening build lands as though it were a change.
 *
 * @returns {import('esbuild').Plugin}
 */
function restartPlugin() {
  let first = true
  return {
    name: 'piano-restart-electron',
    setup(build) {
      build.onEnd((result) => {
        if (first) {
          first = false
          return
        }
        if (result.errors.length > 0 || shuttingDown) {
          return
        }
        scheduleRestart()
      })
    },
  }
}

/**
 * Coalesce a burst into a single restart. Main and preload are two contexts
 * that nearly always rebuild together, and one edit must not mean two windows.
 */
function scheduleRestart() {
  if (restartTimer !== null) {
    return
  }
  restartTimer = setTimeout(() => {
    restartTimer = null
    restartChain = restartChain.then(restartElectron).catch((error) => {
      process.stderr.write(`dev: restart failed: ${String(error)}\n`)
    })
  }, RESTART_DEBOUNCE_MS)
}

const contexts = await Promise.all(
  esbuildOptions(true).map((options) =>
    context({ ...options, plugins: [...(options.plugins ?? []), restartPlugin()] }),
  ),
)

await Promise.all(contexts.map((ctx) => ctx.watch()))

function startElectron() {
  electron = spawn(electronPath, ['.'], {
    cwd: appDir,
    stdio: 'inherit',
    env: electronEnv({
      VITE_DEV_SERVER_URL: devServerUrl,
      PIANO_USER_DATA_DIR: devUserDataDir,
    }),
  })

  const child = electron
  child.on('exit', (code) => {
    if (restarting || shuttingDown) {
      return
    }
    // The user closed the window: that is how `npm run dev` ends.
    void shutdown(code ?? 0)
  })
}

async function restartElectron() {
  if (shuttingDown) {
    return
  }
  const running = electron
  if (running === null || running.exitCode !== null) {
    startElectron()
    return
  }
  restarting = true
  try {
    const exited = once(running, 'exit')
    running.kill()
    await exited
  } finally {
    restarting = false
  }
  if (!shuttingDown) {
    startElectron()
  }
}

/** @param {number} code */
async function shutdown(code) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  if (restartTimer !== null) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  if (electron !== null && electron.exitCode === null) {
    electron.kill()
  }
  await Promise.all(contexts.map((ctx) => ctx.dispose()))
  await server.close()
  process.exit(code)
}

process.on('SIGINT', () => {
  void shutdown(0)
})
process.on('SIGTERM', () => {
  void shutdown(0)
})

startElectron()

process.stdout.write(`piano: dev server on ${devServerUrl}\n`)
