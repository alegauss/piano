import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

/**
 * The MCP server as one file the plugin can run with nothing installed.
 *
 * A plugin is a folder Claude Code copies, not a package it installs, so the
 * server it declares has to run from that folder alone: no workspace, no
 * node_modules, no TypeScript. Everything is bundled in — the protocol SDK,
 * the score format, the link contract — and the result is committed, because
 * a plugin installed from the repository is installed from what is in it.
 *
 * CommonJS, because some of what the SDK pulls in is CommonJS and an ES module
 * bundle cannot require it back. Minified, which also strips the path comments
 * that would make the output depend on where it was built.
 *
 * With --check it writes nothing and fails when the committed bundle is not
 * the one the source builds. A committed bundle is the easiest thing in a
 * repository to forget to rebuild: the source is fixed, the tests pass, and
 * everybody who installs the plugin runs last week's server.
 */

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const outfile = 'plugin/server/piano-mcp.cjs'

/** @type {import('esbuild').BuildOptions} */
const options = {
  absWorkingDir: repoRoot,
  entryPoints: ['apps/mcp-server/src/main.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
}

if (process.argv.includes('--check')) {
  const result = await build({ ...options, write: false })
  const fresh = result.outputFiles[0]?.text ?? ''
  const held = await readFile(join(repoRoot, outfile), 'utf8').catch(() => '')
  if (fresh !== held) {
    process.stderr.write(
      `plugin: ${outfile} is not the bundle the server source builds. ` +
        'Run `npm run plugin` and commit what it writes.\n',
    )
    process.exit(1)
  }
  process.stdout.write('plugin: the bundled server matches its source\n')
} else {
  await build(options)
  process.stdout.write(`plugin: wrote ${outfile}\n`)
}
