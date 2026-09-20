import { fileURLToPath } from 'node:url'

/** The app root, with a trailing separator stripped by fileURLToPath. */
export const appDir = fileURLToPath(new URL('..', import.meta.url))

/**
 * Main and preload are bundled by esbuild rather than served by Vite: they run
 * in Node, they are loaded once at startup, and fast reload buys nothing there.
 * CommonJS output because a sandboxed preload cannot be an ES module.
 *
 * @param {boolean} dev
 * @returns {import('esbuild').BuildOptions[]}
 */
export function esbuildOptions(dev) {
  /** @type {import('esbuild').BuildOptions} */
  const shared = {
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    // Electron is provided by the runtime, never bundled into it.
    external: ['electron'],
    sourcemap: dev ? 'inline' : true,
    minify: !dev,
    logLevel: 'warning',
  }

  return [
    {
      ...shared,
      entryPoints: [fileURLToPath(new URL('../src/main/main.ts', import.meta.url))],
      outfile: fileURLToPath(new URL('../dist/main/main.cjs', import.meta.url)),
    },
    {
      ...shared,
      entryPoints: [fileURLToPath(new URL('../src/preload/preload.ts', import.meta.url))],
      outfile: fileURLToPath(new URL('../dist/preload/preload.cjs', import.meta.url)),
    },
  ]
}
