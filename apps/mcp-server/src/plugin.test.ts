import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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

describe('somebody with the plugin and not the app', () => {
  it('is told where to get the app, not that a connection was refused', () => {
    expect(NO_WINDOW).toContain(APP_RELEASES)
    expect(NO_WINDOW).not.toMatch(/refused|ECONN|socket/i)
  })
})
