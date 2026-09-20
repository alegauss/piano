import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * One copy of the score format, and it lives in packages/score-format.
 *
 * The rule is easy to state and easy to break by accident: somebody needs a
 * field the package does not have yet, declares it locally "for now", and a
 * month later the app accepts a file the MCP server rejects. That drift shows
 * up as music that does not play rather than as a type error, which is the
 * expensive kind of defect. So the rule is checked rather than written down.
 *
 * Two things are refused anywhere outside the package:
 *   - declaring a score type, and
 *   - reaching into the package by relative path instead of by its name, which
 *     is how a second copy gets vendored one file at a time.
 */

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const owner = join('packages', 'score-format')
/** The same path, spelled the way a message should print it on any platform. */
const ownerLabel = 'packages/score-format'

/** Directories that hold no source of ours. */
const SKIP = new Set(['node_modules', 'dist', '.git', '.tsbuild', '.roadkeep'])

const SOURCE = /\.(?:ts|tsx|mts|cts)$/

/** A score type declared where it does not belong. */
const DECLARES_SCORE_TYPE = /^\s*(?:export\s+)?(?:type|interface)\s+(Score\w*|\w*ScoreMetadata)\b/

/** An import that walks to the package instead of naming it. */
const RELATIVE_REACH = /from\s+['"][^'"]*score-format[^'"]*['"]/

/**
 * @param {string} dir
 * @returns {AsyncGenerator<string>}
 */
async function* sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) {
        continue
      }
      yield* sourceFiles(full)
    } else if (SOURCE.test(entry.name)) {
      yield full
    }
  }
}

/** @type {string[]} */
const problems = []

for await (const file of sourceFiles(repoRoot)) {
  const rel = relative(repoRoot, file)
  if (rel.startsWith(owner + sep)) {
    continue
  }

  const lines = (await readFile(file, 'utf8')).split(/\r?\n/)
  lines.forEach((line, index) => {
    const where = `${rel.split(sep).join('/')}:${String(index + 1)}`

    const declaration = DECLARES_SCORE_TYPE.exec(line)
    if (declaration !== null) {
      problems.push(`${where}  declares ${String(declaration[1])}; the format lives in ${ownerLabel}`)
    }

    if (RELATIVE_REACH.test(line) && !line.includes('@piano/score-format')) {
      problems.push(`${where}  reaches the format by path; import it as @piano/score-format`)
    }
  })
}

if (problems.length > 0) {
  process.stderr.write(`the score format has more than one owner:\n${problems.join('\n')}\n`)
  process.exit(1)
}

process.stdout.write(`format ownership: only ${ownerLabel} declares the score\n`)
