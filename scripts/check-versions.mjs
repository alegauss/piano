import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

/**
 * One version for a release, decided once, in the root package.json.
 *
 * A person sees a version in three places: the file they downloaded, the app's
 * own footer, and the plugin list in Claude Code. When the link says one side
 * is older, it names those numbers, so they have to be the same decision; a
 * message pointing at a number nobody can find sends somebody to update the
 * wrong thing. Everything that carries one is checked against the root here,
 * and with --tag the release tag is too, so a tag that disagrees builds
 * nothing.
 *
 * The link protocol is not in this list. It is a compatibility number that
 * changes only when the two sides stop understanding each other, which is
 * rarer than a release and says something different.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

const { values } = parseArgs({ options: { tag: { type: 'string' } } })

/**
 * @param {string} path
 * @returns {Promise<{ version?: unknown }>}
 */
async function json(path) {
  return JSON.parse(await readFile(join(repoRoot, path), 'utf8'))
}

/**
 * A version as written, or a description of what was there instead.
 *
 * @param {unknown} value
 * @returns {string}
 */
function spelled(value) {
  return typeof value === 'string' ? value : `no version (${JSON.stringify(value) ?? 'nothing'})`
}

const release = spelled((await json('package.json')).version)

/**
 * Where else the version is written, and how to read it from there.
 *
 * @type {[string, (path: string) => Promise<unknown>][]}
 */
const carriers = [
  ['apps/desktop/package.json', async (path) => (await json(path)).version],
  ['apps/mcp-server/package.json', async (path) => (await json(path)).version],
  ['plugin/.claude-plugin/plugin.json', async (path) => (await json(path)).version],
  [
    'apps/mcp-server/src/version.ts',
    async (path) =>
      /PLUGIN_VERSION = '([^']*)'/.exec(await readFile(join(repoRoot, path), 'utf8'))?.[1],
  ],
]

/** @type {string[]} */
const problems = []
if (!/^\d+\.\d+\.\d+$/.test(release)) {
  problems.push(`package.json: ${release} is not a release version such as 1.2.3`)
}
for (const [path, read] of carriers) {
  const found = spelled(await read(path))
  if (found !== release) {
    problems.push(`${path}: ${found}, where the release is ${release}`)
  }
}
if (values.tag !== undefined) {
  const tag = values.tag.replace(/^refs\/tags\//, '')
  if (tag !== `v${release}`) {
    problems.push(`the tag is ${tag}, and a release of ${release} is tagged v${release}`)
  }
}

if (problems.length > 0) {
  const listed = problems.map((one) => `  ${one}`).join('\n')
  process.stderr.write(
    `versions: one release, one version, and these disagree:\n${listed}\n` +
      'Change the root package.json and every file above together.\n',
  )
  process.exit(1)
}
process.stdout.write(`versions: everything says ${release}\n`)
