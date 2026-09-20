import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * The electron package exports the path to its binary as a bare string, which
 * its own type declarations do not describe, so createRequire is the honest
 * way to read it.
 *
 * @type {string}
 */
export const electronPath = /** @type {string} */ (/** @type {unknown} */ (require('electron')))

/**
 * Build the environment to launch electron with.
 *
 * VS Code sets ELECTRON_RUN_AS_NODE=1 for its own helper processes, and every
 * terminal it spawns inherits it. Passed through, it turns `electron .` into a
 * plain Node process: no window, no error, exit code 0. Stripping it here is
 * what keeps that from being rediscovered every time someone runs the app from
 * an editor terminal.
 *
 * @param {NodeJS.ProcessEnv} [extra]
 * @returns {NodeJS.ProcessEnv}
 */
export function electronEnv(extra) {
  const env = { ...process.env, ...extra }
  delete env['ELECTRON_RUN_AS_NODE']
  return env
}
