import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Colours are written down once, in tokens.css, and nowhere else.
 *
 * The rule exists because half this interface is DOM and half is a canvas.
 * Tailwind classes mean nothing to a 2D context, so the roll reads the same
 * custom properties through getComputedStyle. The moment a component writes a
 * literal instead, the two halves have separate sources and they drift — first
 * by a shade nobody notices, then by enough that the roll looks pasted on.
 *
 * Only the token file may spell a colour. Everything else names one.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/**
 * The renderer is what this governs: it is the half that has tokens available
 * and the half where a stray literal silently stops matching the canvas. The
 * main process cannot read a stylesheet at all — it needs a window background
 * before any CSS exists — so its one colour lives in window-preferences.ts,
 * named and documented as mirroring a token, rather than being policed here
 * by a rule it could never satisfy.
 */
const governed = join('apps', 'desktop', 'src', 'renderer')

/** The one file allowed to contain colour literals. */
const TOKEN_FILE = join(governed, 'styles', 'tokens.css')
const SKIP = new Set(['node_modules', 'dist', '.git', '.tsbuild', '.roadkeep'])
const SOURCE = /\.(?:ts|tsx|css|html)$/

/** #abc, #aabbcc, rgb(...), rgba(...), hsl(...), oklch(...) written by hand. */
const COLOUR_LITERAL =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\s*\(/

/**
 * Tailwind's own palette names are literals by another spelling: bg-red-500
 * pins a colour the token file never sees.
 */
const TAILWIND_PALETTE =
  /\b(?:bg|text|border|fill|stroke|ring|outline|from|via|to|shadow|decoration|accent|caret|divide|placeholder)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/

/**
 * @param {string} dir
 * @returns {AsyncGenerator<string>}
 */
async function* sourceFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) {
        yield* sourceFiles(full)
      }
    } else if (SOURCE.test(entry.name)) {
      yield full
    }
  }
}

/** @type {string[]} */
const problems = []

for await (const file of sourceFiles(join(repoRoot, governed))) {
  const rel = relative(repoRoot, file)
  if (rel === TOKEN_FILE) {
    continue
  }

  const lines = (await readFile(file, 'utf8')).split(/\r?\n/)
  lines.forEach((line, index) => {
    // A line that only mentions a colour in prose is not setting one.
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
    const where = `${rel.split(sep).join('/')}:${String(index + 1)}`

    if (COLOUR_LITERAL.test(code)) {
      problems.push(`${where}  writes a colour literal; name a token from tokens.css instead`)
    }
    if (TAILWIND_PALETTE.test(code)) {
      problems.push(`${where}  uses a Tailwind palette colour; name a token from tokens.css instead`)
    }
  })
}

if (problems.length > 0) {
  process.stderr.write(`colours are written outside tokens.css:\n${problems.join('\n')}\n`)
  process.exit(1)
}

process.stdout.write('colour tokens: only tokens.css spells a colour\n')
