// The route pair, the twin per route, the sitemap and the social card, asserted against the
// built output. These read dist/, so they run after `npm run build`, which is what CI does. A
// claim that has gone false (a route with no file, a duplicate title, a twin that leaked the
// nav or the call to action, a card that is not 1200x630) fails here rather than being
// invisible until somebody reads the page against the product.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(siteDir, 'dist')

let manifest
before(() => {
  const mf = join(distDir, 'manifest.json')
  assert.ok(existsSync(mf), 'dist/manifest.json is missing: run `npm run build` first')
  manifest = JSON.parse(readFileSync(mf, 'utf8'))
})

const EXPECTED = [
  '/',
  '/claude-code',
  '/features/falling-notes',
  '/features/sheet-music',
  '/features/practice',
  '/features/library',
  '/features/score-format',
]

test('every expected route is in the manifest, and nothing else', () => {
  assert.deepEqual(manifest.routes.map((r) => r.path).sort(), [...EXPECTED].sort())
})

test('each route has its HTML and Markdown file at the stated size', () => {
  for (const r of manifest.routes) {
    const html = join(distDir, r.html)
    const md = join(distDir, r.markdown)
    assert.ok(existsSync(html), `${r.html} missing`)
    assert.ok(existsSync(md), `${r.markdown} missing`)
    assert.equal(statSync(html).size, r.htmlBytes, `${r.html} size drifted from manifest`)
    assert.equal(statSync(md).size, r.markdownBytes, `${r.markdown} size drifted from manifest`)
  }
})

test('each page has a unique title, its canonical, and an og:image', () => {
  const titles = new Set()
  for (const r of manifest.routes) {
    const html = readFileSync(join(distDir, r.html), 'utf8')
    const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1]
    assert.ok(title, `${r.html} has no <title>`)
    assert.ok(!titles.has(title), `duplicate <title>: ${title}`)
    titles.add(title)
    assert.ok(html.includes(`<link rel="canonical" href="${r.url}"`), `${r.html} canonical wrong`)
    assert.ok(html.includes('property="og:image"'), `${r.html} has no og:image`)
    // the prerendered body is in the file, not left for the client to draw
    assert.ok(!html.includes('<div id="root"></div>'), `${r.html} was not prerendered`)
  }
})

test('no twin leaks the nav, the footer or a call to action', () => {
  // one marker each from the nav, the footer, the sponsor and the calls to action
  const banned = ['★ View on GitHub', 'not affiliated with', 'Viglet', 'Install the plugin']
  for (const r of manifest.routes) {
    const md = readFileSync(join(distDir, r.markdown), 'utf8')
    assert.ok(md.trim().length > 0, `${r.markdown} is empty`)
    for (const b of banned) {
      assert.ok(!md.includes(b), `${r.markdown} leaked "${b}"`)
    }
  }
})

test('the landing twin carries the session and the install lines', () => {
  const md = readFileSync(join(distDir, 'index.md'), 'utf8')
  assert.ok(md.includes('save_score'), 'landing twin is missing the hero session')
  assert.ok(md.includes('/plugin marketplace add alegauss/piano'), 'landing twin has no install')
})

test('the sitemap lists every route exactly once, with the base prefix', () => {
  const xml = readFileSync(join(distDir, 'sitemap.xml'), 'utf8')
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  assert.equal(locs.length, manifest.routes.length, 'sitemap URL count differs from the routes')
  assert.equal(new Set(locs).size, locs.length, 'the sitemap lists a URL twice')
  for (const r of manifest.routes) {
    assert.ok(locs.includes(r.url), `sitemap missing ${r.url}`)
  }
  for (const loc of locs) {
    assert.ok(loc.startsWith(`https://alegauss.github.io${manifest.base}`), `${loc} lost the base`)
  }
})

test('robots allows everything and names the sitemap beside it', () => {
  const robots = readFileSync(join(distDir, 'robots.txt'), 'utf8')
  assert.match(robots, /^User-agent: \*$/m)
  assert.match(robots, /^Allow: \/$/m)
  const named = robots.match(/^Sitemap: (\S+)$/m)
  assert.ok(named, 'robots.txt names no sitemap')
  assert.equal(named[1], `https://alegauss.github.io${manifest.base}sitemap.xml`)
})

test('the social card is a 1200x630 PNG', () => {
  const png = join(distDir, 'og.png')
  assert.ok(existsSync(png), 'dist/og.png missing')
  const buf = readFileSync(png)
  assert.equal(buf.toString('ascii', 1, 4), 'PNG', 'og.png is not a PNG')
  assert.equal(buf.readUInt32BE(16), 1200, 'og.png width')
  assert.equal(buf.readUInt32BE(20), 630, 'og.png height')
})

// The Pages workflows copy the sample pack into dist/pack/ after this build, and the app
// downloads it from /piano/pack/. A site route at that path would be served in its place.
test('no route claims the path the sample pack is served under', () => {
  for (const r of manifest.routes) {
    assert.ok(!r.path.startsWith('/pack'), `${r.path} would shadow the sample pack`)
  }
})
