// The generated facts, asserted against the sources they came from and against the page. The
// generator throws on a source it cannot read; these catch the quieter drift: a count the page
// states that is not the count the source holds, and a tool the server gained that no group on
// /claude-code shows.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(siteDir, '..')
const distDir = join(siteDir, 'dist')

// product.generated.ts is a TypeScript module; its payload is JSON after the `=`.
function generated() {
  const src = readFileSync(join(siteDir, 'src', 'lib', 'product.generated.ts'), 'utf8')
  return JSON.parse(src.slice(src.indexOf('= ') + 2))
}

test('the generated tools are the tools the server declares, in its order', () => {
  const src = readFileSync(join(repoRoot, 'apps', 'mcp-server', 'src', 'tools.ts'), 'utf8')
  const declared = [...src.matchAll(/^\s+name: '([a-z_]+)',$/gm)].map((m) => m[1])
  assert.deepEqual(
    generated().tools.map((t) => t.name),
    declared,
  )
})

test('the generated commands are the files in plugin/commands', () => {
  const files = readdirSync(join(repoRoot, 'plugin', 'commands'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `/piano:${f.replace(/\.md$/, '')}`)
    .sort()
  assert.deepEqual(
    generated().commands.map((c) => c.name),
    files,
  )
})

test('the version is the one package.json and the plugin manifest agree on', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
  const plugin = JSON.parse(
    readFileSync(join(repoRoot, 'plugin', '.claude-plugin', 'plugin.json'), 'utf8'),
  )
  assert.equal(generated().version, pkg.version)
  assert.equal(plugin.version, pkg.version)
})

test('the licence the site names is the licence the LICENSE file grants', () => {
  const licence = readFileSync(join(repoRoot, 'LICENSE'), 'utf8')
  assert.equal(generated().license, 'MIT')
  assert.match(licence, /^MIT License/)
})

test('every tool the server registers appears on /claude-code', () => {
  const md = readFileSync(join(distDir, 'claude-code', 'index.md'), 'utf8')
  for (const t of generated().tools) {
    assert.ok(md.includes(`\`${t.name}\``), `/claude-code does not show ${t.name}`)
  }
})

test('every command the plugin brings appears on /claude-code', () => {
  const md = readFileSync(join(distDir, 'claude-code', 'index.md'), 'utf8')
  for (const c of generated().commands) {
    assert.ok(md.includes(`\`${c.name}\``), `/claude-code does not show ${c.name}`)
  }
})

test('the install section tells the truth about whether there is a release', () => {
  const md = readFileSync(join(distDir, 'index.md'), 'utf8')
  if (generated().release === null) {
    assert.ok(md.includes('No release has been tagged yet'), 'the page implies a download')
  } else {
    assert.ok(!md.includes('No release has been tagged yet'), 'the page denies a release')
  }
})
