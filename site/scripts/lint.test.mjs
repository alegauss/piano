// Source rules the build cannot see.
//
// Only the reader moves the window: a panel that keeps its own content in view scrolls its
// own element, never scrollIntoView, which scrolls every scrollable ancestor including the
// document and drags a reader who has scrolled past the hero back to it on every step.
//
// And the site fetches no third-party font at page load, so no source may link Google Fonts.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'dist-server') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const sourceFiles = walk(join(siteDir, 'src')).filter((f) =>
  ['.ts', '.tsx', '.js', '.jsx', '.css'].includes(extname(f)),
)
const rel = (f) => relative(siteDir, f).split('\\').join('/')

test('no source calls scrollIntoView', () => {
  // the call, not the word: a comment explaining why it is avoided is fine
  const offenders = sourceFiles.filter((f) => readFileSync(f, 'utf8').includes('scrollIntoView('))
  assert.deepEqual(
    offenders.map(rel),
    [],
    'a panel must scroll its own element (scrollTop), never scrollIntoView',
  )
})

test('no source fetches a third-party font at page load', () => {
  const all = [...sourceFiles, join(siteDir, 'index.html')]
  const offenders = all.filter((f) => readFileSync(f, 'utf8').includes('fonts.googleapis.com'))
  assert.deepEqual(offenders.map(rel), [])
})

// The fall and the glow are kept in step by one shared duration: the note lands at the moment
// the key lights only while both keyframes last the same time. Two numbers in a stylesheet that
// must agree are two numbers somebody retunes one of, so the agreement is asserted.
test('a falling note and the key it lights share one duration', () => {
  const css = readFileSync(join(siteDir, 'src', 'index.css'), 'utf8')
  const duration = (rule) =>
    new RegExp(`\\.${rule}\\s*\\{[^}]*animation:\\s*[\\w-]+\\s+([\\d.]+s)`).exec(css)?.[1]
  const fall = duration('key-note')
  const glow = duration('key-glow')
  assert.ok(fall && glow, 'index.css no longer animates .key-note and .key-glow')
  assert.equal(fall, glow)
})
