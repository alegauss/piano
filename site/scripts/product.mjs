// Every name and number the site states about the product is read out of this repository,
// never typed into the copy. A marketing claim that has gone false is invisible until somebody
// reads the page against the product, and the only defence is for the page to have no second
// copy of the fact. This writes src/lib/product.generated.ts from:
//
//   package.json                              the version and the licence everything ships under
//   apps/mcp-server/src/tools.ts              the tools the MCP server registers, in its order
//   plugin/commands/*.md                      the slash commands the plugin brings
//   .claude-plugin/marketplace.json           the names the install lines spell
//   apps/desktop/src/renderer/lib/levels.ts   the three levels, in the app's own sentence
//   apps/desktop/src/main/bundled/            the scores a fresh install opens with
//   packages/score-format/src/version.ts      the score format's version
//   git tags                                  whether there is a release to download
//
// A source that no longer has the shape read here throws. A red build, never a page left
// confidently stale. The output is not committed: it is rebuilt by every build and every dev
// server, so there is no stale copy of it to forget.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const siteDir = join(here, '..')
const repoRoot = join(siteDir, '..')
const outFile = join(siteDir, 'src', 'lib', 'product.generated.ts')

function read(rel) {
  try {
    return readFileSync(join(repoRoot, rel), 'utf8')
  } catch (err) {
    throw new Error(`product: cannot read ${rel}: ${err.message}`)
  }
}

function fail(message) {
  throw new Error(`product: ${message}`)
}

// --- package.json ---
const pkg = JSON.parse(read('package.json'))
if (!/^\d+\.\d+\.\d+$/.test(pkg.version ?? '')) fail('package.json has no plain version')
if (typeof pkg.license !== 'string') fail('package.json declares no licence')
const node = /^>=\s*(\d+(?:\.\d+)?)/.exec(pkg.engines?.node ?? '')?.[1]
if (!node) fail('package.json engines.node is not a ">=N" floor')

// --- the MCP tools ---
// Each tool is a `tool({ name: '…', title: '…', description: '…' + '…' + …` literal. The
// description is a run of single-quoted strings joined by +; the first sentence is what the
// site shows, because it is the sentence written to say what the tool is for.
const toolsSrc = read('apps/mcp-server/src/tools.ts')
const declared = [...toolsSrc.matchAll(/^\s+name: '([a-z_]+)',$/gm)].map((m) => m[1])
const tools = [
  ...toolsSrc.matchAll(
    /tool\(\{\s*name: '([a-z_]+)',\s*title: '([^']+)',\s*description:\s*((?:'(?:[^'\\]|\\.)*'\s*\+?\s*)+)/g,
  ),
].map((m) => {
  const description = [...m[3].matchAll(/'((?:[^'\\]|\\.)*)'/g)]
    .map((s) => s[1].replace(/\\'/g, "'"))
    .join('')
  const summary = /^.*?[.!?](?=\s|$)/.exec(description)?.[0] ?? description
  return { name: m[1], title: m[2], summary }
})
if (tools.length === 0) fail('found no tool({ name, title, description }) in tools.ts')
if (tools.length !== declared.length) {
  fail(
    `tools.ts declares ${declared.length} tool names but ${tools.length} read as tools; ` +
      'a tool literal no longer has the shape this script reads',
  )
}

// --- the plugin's commands ---
const marketplace = JSON.parse(read('.claude-plugin/marketplace.json'))
const plugin = marketplace.plugins?.[0]?.name
if (!marketplace.name || !plugin) fail('marketplace.json names no marketplace or plugin')

const commandsDir = join(repoRoot, 'plugin', 'commands')
const commands = readdirSync(commandsDir)
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((file) => {
    const text = readFileSync(join(commandsDir, file), 'utf8')
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1]
    if (!front) fail(`plugin/commands/${file} has no front matter`)
    const field = (key) =>
      new RegExp(`^${key}:\\s*(.+)$`, 'm')
        .exec(front)?.[1]
        .trim()
        .replace(/^'(.*)'$/, '$1')
    const description = field('description')
    if (!description) fail(`plugin/commands/${file} has no description`)
    return {
      name: `/${plugin}:${file.replace(/\.md$/, '')}`,
      hint: field('argument-hint') ?? '',
      description,
    }
  })
if (commands.length === 0) fail('plugin/commands holds no commands')

// --- the levels ---
const levelsSrc = read('apps/desktop/src/renderer/lib/levels.ts')
const levels = [
  ...levelsSrc.matchAll(/level: '([a-z]+)',\s*label: '([^']+)',\s*means: '([^']+)'/g),
].map((m) => ({ level: m[1], label: m[2], means: m[3] }))
if (levels.length !== 3) fail(`levels.ts gives ${levels.length} level presets, expected three`)

// --- the bundled scores ---
const bundledDir = join(repoRoot, 'apps', 'desktop', 'src', 'main', 'bundled')
const bundled = readdirSync(bundledDir)
  .filter((f) => f.endsWith('.score.json'))
  .sort()
  .map((f) => {
    const score = JSON.parse(readFileSync(join(bundledDir, f), 'utf8'))
    const title = score.metadata?.title
    if (!title) fail(`bundled/${f} has no metadata.title`)
    return { title, composer: score.metadata.composer ?? null }
  })
if (bundled.length === 0) fail('the app bundles no scores')

// The format page shows a score rather than describing one, and the score it shows is one the
// app ships: the head of Ode to Joy, cut down to its first notes. Cut, never retyped, so the
// excerpt is valid for as long as the file it comes from is.
const EXCERPT_FROM = 'ode-to-joy.score.json'
const EXCERPT_NOTES = 3
const whole = JSON.parse(readFileSync(join(bundledDir, EXCERPT_FROM), 'utf8'))
if (!Array.isArray(whole.notes) || whole.notes.length < EXCERPT_NOTES) {
  fail(`bundled/${EXCERPT_FROM} has fewer than ${EXCERPT_NOTES} notes`)
}
const { id, title, composer, level, difficulty } = whole.metadata
// One note per line reads as a score; one field per line would read as a config file.
const flat = (value) => JSON.stringify(value).replaceAll('":', '": ').replaceAll(',"', ', "')
const excerpt = [
  '{',
  `  "formatVersion": ${whole.formatVersion},`,
  `  "metadata": ${flat({ id, title, composer, level, difficulty })},`,
  `  "timing": ${flat({ ticksPerQuarter: whole.timing.ticksPerQuarter, tempo: whole.timing.tempo })},`,
  '  "notes": [',
  ...whole.notes.slice(0, EXCERPT_NOTES).map((note) => `    ${flat(note)},`),
  '    …',
  '  ]',
  '}',
].join('\n')

// --- the score format ---
const formatVersion = Number(
  /export const FORMAT_VERSION = (\d+)/.exec(read('packages/score-format/src/version.ts'))?.[1],
)
if (!formatVersion) fail('packages/score-format/src/version.ts exports no FORMAT_VERSION')

// --- is there a release? ---
// The release workflow builds on the tag, and the Pages workflow fetches tags before it builds,
// so this is the question GitHub would answer. A clone with no tags, or no git, says no: a page
// that offers a download nobody can take is the worse of the two mistakes.
function latestTag() {
  try {
    const out = execFileSync('git', ['tag', '--list', 'v*', '--sort=-v:refname'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    return out.split(/\r?\n/).find((t) => /^v\d+\.\d+\.\d+$/.test(t)) ?? null
  } catch {
    return null
  }
}
const release = latestTag()

const data = {
  name: 'Piano',
  repo: 'alegauss/piano',
  version: pkg.version,
  license: pkg.license,
  node,
  formatVersion,
  release,
  marketplace: marketplace.name,
  plugin,
  tools,
  commands,
  levels,
  bundled,
  excerpt: { from: EXCERPT_FROM, notes: whole.notes.length, json: excerpt },
}

const banner =
  '// GENERATED by scripts/product.mjs from this repository: do not edit by hand, and it is\n' +
  '// not committed. Regenerated by every build and dev server, so a renamed tool, a new\n' +
  '// command or a first release reaches the page without anybody retyping it.\n'

writeFileSync(
  outFile,
  banner +
    "import type { ProductData } from './product-types'\n\n" +
    'export const product: ProductData = ' +
    JSON.stringify(data, null, 2) +
    '\n',
)

console.log(
  `product: v${data.version}, ${tools.length} tools, ${commands.length} commands, ` +
    `${bundled.length} bundled scores, release ${release ?? 'none yet'} -> src/lib/product.generated.ts`,
)
