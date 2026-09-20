import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

import { context } from 'esbuild'
import { createServer } from 'vite'

import { electronEnv, electronPath } from './electron.mjs'
import { appDir, esbuildOptions } from './esbuild.options.mjs'

const viteConfigFile = fileURLToPath(new URL('../vite.config.mts', import.meta.url))

/** @type {import('node:child_process').ChildProcess | null} */
let electron = null
/** True while a rebuild is deliberately killing electron, so its exit is not the user quitting. */
let restarting = false
/** The first esbuild pass must not restart anything: there is nothing running yet. */
let started = false
let shuttingDown = false

const server = await createServer({ configFile: viteConfigFile })
await server.listen()

const devServerUrl = server.resolvedUrls?.local?.[0]
if (devServerUrl === undefined) {
  throw new Error('dev: vite started but reported no local url')
}

/** Rebuilding main or preload means restarting electron; the renderer hot-reloads itself. */
const restartPlugin = {
  name: 'piano-restart-electron',
  /** @param {import('esbuild').PluginBuild} build */
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0 || !started || shuttingDown) {
        return
      }
      void restartElectron()
    })
  },
}

const contexts = await Promise.all(
  esbuildOptions(true).map((options) =>
    context({ ...options, plugins: [...(options.plugins ?? []), restartPlugin] }),
  ),
)

await Promise.all(contexts.map((ctx) => ctx.watch()))

function startElectron() {
  electron = spawn(electronPath, ['.'], {
    cwd: appDir,
    stdio: 'inherit',
    env: electronEnv({ VITE_DEV_SERVER_URL: devServerUrl }),
  })

  electron.on('exit', (code) => {
    if (restarting || shuttingDown) {
      return
    }
    // The user closed the window: that is how `npm run dev` ends.
    void shutdown(code ?? 0)
  })
}

async function restartElectron() {
  if (electron === null) {
    startElectron()
    return
  }
  restarting = true
  const exited = once(electron, 'exit')
  electron.kill()
  await exited
  restarting = false
  startElectron()
}

/** @param {number} code */
async function shutdown(code) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
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

started = true
startElectron()

process.stdout.write(`piano: dev server on ${devServerUrl}\n`)
