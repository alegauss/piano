import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  arrangementForLevel,
  AS_WRITTEN,
  barAtTick,
  notesOf,
  parseScore,
  resolveArrangement,
  timingOf,
} from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { APP_RELEASES, NO_WINDOW } from './link'
import { PLUGIN_VERSION } from './version'

/**
 * The plugin is a folder of files Claude Code reads, and nothing compiles
 * them, so nothing else will notice them drifting from the server they
 * declare. These are the joins: the version, the path to the bundle, and the
 * commands being commands.
 */

const at = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url))
const json = (path: string) => JSON.parse(readFileSync(at(path), 'utf8')) as Record<string, unknown>

const manifest = json('plugin/.claude-plugin/plugin.json') as {
  name: string
  version: string
  mcpServers: Record<string, { command: string; args: string[] }>
}
const marketplace = json('.claude-plugin/marketplace.json') as {
  plugins: { name: string; source: string }[]
}

describe('the plugin manifest', () => {
  it('carries the version the server reports', () => {
    expect(manifest.version).toBe(PLUGIN_VERSION)
  })

  it('starts the server from the bundle the build writes, with Node and nothing else', () => {
    const server = manifest.mcpServers['piano']
    expect(server?.command).toBe('node')
    expect(server?.args).toEqual(['${CLAUDE_PLUGIN_ROOT}/server/piano-mcp.cjs'])
    // The bundle script writes exactly there, or the plugin starts nothing.
    const bundle = readFileSync(at('apps/mcp-server/scripts/bundle.mjs'), 'utf8')
    expect(bundle).toContain("const outfile = 'plugin/server/piano-mcp.cjs'")
  })

  it('is offered by the repository’s marketplace under the same name', () => {
    expect(marketplace.plugins).toContainEqual(
      expect.objectContaining({ name: manifest.name, source: './plugin' }),
    )
  })
})

describe('the commands', () => {
  const commands = readdirSync(at('plugin/commands')).filter((name) => name.endsWith('.md'))

  it('are the four things people ask for', () => {
    expect(commands.sort()).toEqual(['compose.md', 'level.md', 'play.md', 'practise.md'])
  })

  it.each(commands)('%s says what it does before it is run', (name) => {
    const text = readFileSync(at(`plugin/commands/${name}`), 'utf8')
    expect(text).toMatch(/^---\ndescription: .{10,}\n/)
    expect(text).toContain('$ARGUMENTS')
  })
})

describe('the score-writing skill', () => {
  const skill = readFileSync(at('plugin/skills/piano-score/SKILL.md'), 'utf8')
  const example = /```json\n([\s\S]+?)\n```/.exec(skill)?.[1] ?? ''
  const parsed = parseScore(JSON.parse(example))
  const score = parsed.ok ? parsed.score : null
  const notes = score === null ? [] : notesOf(score)
  const timing = score === null ? null : timingOf(score)

  /** Each hand's notes, bar by bar, as the checks below read them. */
  function bars(hand: 'left' | 'right'): Map<number, typeof notes> {
    const found = new Map<number, typeof notes>()
    for (const note of notes.filter((one) => one.hand === hand)) {
      const bar = timing === null ? 0 : barAtTick(timing, note.start).bar
      found.set(bar, [...(found.get(bar) ?? []), note])
    }
    return found
  }

  it('says when to use it before it is loaded', () => {
    expect(skill).toMatch(/^---\nname: piano-score\ndescription: .{40,}\n---/)
  })

  it('gives an example that validates the first time', () => {
    expect(parsed.ok ? [] : parsed.problems).toEqual([])
    expect(notes.length).toBeGreaterThan(10)
  })

  it('names the mistakes a schema cannot catch', () => {
    for (const mistake of [
      'left hand above the right',
      'chord no hand can reach',
      'melody stuck in one octave',
      'beginner arrangement identical to the advanced one',
      'Velocity with no dynamics',
      'under copyright',
    ]) {
      expect(skill, mistake).toContain(mistake)
    }
  })

  it('makes none of them in its own example', () => {
    const right = bars('right')
    for (const [bar, left] of bars('left')) {
      // The left hand stays below the right, bar by bar.
      const highestLeft = Math.max(...left.map((one) => one.pitch))
      const lowestRight = Math.min(...(right.get(bar) ?? []).map((one) => one.pitch))
      expect(highestLeft, `bar ${String(bar)}`).toBeLessThan(lowestRight)
    }
    for (const hand of ['left', 'right'] as const) {
      for (const [bar, held] of bars(hand)) {
        // Every bar is full, and no chord is wider than a hand.
        const starts = new Map<number, number[]>()
        for (const one of held) {
          starts.set(one.start, [...(starts.get(one.start) ?? []), one.pitch])
        }
        const filled = [...starts.keys()].reduce(
          (sum, start) =>
            sum + Math.max(...held.filter((one) => one.start === start).map((one) => one.duration)),
          0,
        )
        expect(filled, `${hand} hand, bar ${String(bar)}`).toBe(1920)
        for (const pitches of starts.values()) {
          expect(Math.max(...pitches) - Math.min(...pitches)).toBeLessThanOrEqual(12)
        }
      }
    }
    // The melody moves, and its touch has a shape.
    const melody = notes.filter((one) => one.hand === 'right')
    const pitches = melody.map((one) => one.pitch)
    expect(Math.max(...pitches) - Math.min(...pitches)).toBeGreaterThanOrEqual(12)
    expect(new Set(melody.map((one) => one.velocity)).size).toBeGreaterThan(3)
  })

  it('has a beginner version that is really easier than the piece as written', () => {
    const arrangements = score?.arrangements ?? []
    const easy = arrangementForLevel(arrangements, 'beginner')
    const full = arrangementForLevel(arrangements, 'advanced')
    expect(easy).not.toBeNull()
    expect(full).not.toBeNull()
    const easier = resolveArrangement(easy ?? AS_WRITTEN, notes)
    const written = resolveArrangement(full ?? AS_WRITTEN, notes)
    expect(easier.notes.length).toBeLessThan(written.notes.length)
    expect(easier.tempoScale).toBeLessThan(written.tempoScale)
  })
})

describe('somebody with the plugin and not the app', () => {
  it('is told where to get the app, not that a connection was refused', () => {
    expect(NO_WINDOW).toContain(APP_RELEASES)
    expect(NO_WINDOW).not.toMatch(/refused|ECONN|socket/i)
  })
})
