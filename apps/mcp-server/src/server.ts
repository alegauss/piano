import { LIBRARY_DIRECTORY, PRESENCE_DIRECTORY } from '@piano/ipc'
import { createLibrary, nodeFiles, type Library } from '@piano/library'
import { FORMAT_VERSION } from '@piano/score-format'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { findApp, whereLooked, type Place } from './launch'
import { createLink, noWindow, type Launched, type Link } from './link'
import { toolsFor, type Tool } from './tools'
import { PLUGIN_VERSION } from './version'

/**
 * The server, which is the tool table plus a way to be spoken to.
 *
 * The protocol is the SDK's: an implementation of a specification is not the
 * place to be inventive, and the parts of this worth writing by hand are the
 * tools and what they refuse. Everything that answers a caller goes through
 * one adapter below, so a refusal reads the same whichever tool produced it.
 */

/** Where scores are kept, unless a caller says otherwise. */
export function defaultLibraryRoot(): string {
  const named = process.env['PIANO_LIBRARY']
  return named !== undefined && named.trim() !== '' ? named : join(homedir(), ...LIBRARY_DIRECTORY)
}

/**
 * The tools, wired to a protocol server.
 *
 * A tool that fails says so in its text and is marked as an error, rather than
 * throwing: a caller reading an exception learns that something went wrong,
 * where a caller reading a sentence learns what to do instead.
 */
export function createServer(options: { library: Library; link?: Link }): McpServer {
  const server = new McpServer(
    { name: 'piano', version: PLUGIN_VERSION },
    {
      instructions:
        'A piano that plays scores and teaches them. Scores are JSON in the piano score ' +
        `format, version ${String(FORMAT_VERSION)}: write one, validate it, save it into the ` +
        'library, then play or practise it in the open window.',
    },
  )
  for (const one of toolsFor(options.library, options.link ?? noWindow())) {
    register(server, one)
  }
  return server
}

function register(server: McpServer, one: Tool): void {
  server.registerTool(
    one.name,
    { title: one.title, description: one.description, inputSchema: one.shape },
    async (args: unknown) => {
      const result = await one.run(args)
      return {
        content: [{ type: 'text' as const, text: result.text }],
        structuredContent: result.data === undefined ? undefined : { result: result.data },
        isError: !result.ok,
      }
    },
  )
}

/** Where running apps leave word of themselves, unless a caller says otherwise. */
export function defaultPresenceDirectory(): string {
  const named = process.env['PIANO_PRESENCE_DIR']
  return named !== undefined && named.trim() !== '' ? named : join(homedir(), ...PRESENCE_DIRECTORY)
}

/**
 * Whether a process is running. Signal zero checks without sending anything;
 * a refusal for lack of permission still means somebody is there.
 */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (cause: unknown) {
    return (cause as { code?: string }).code === 'EPERM'
  }
}

/** This machine, as the launcher needs to see it. */
export function nodePlace(): Place {
  return {
    platform: process.platform,
    home: homedir(),
    env: process.env,
    exists: existsSync,
    read: (path) => {
      try {
        return readFileSync(path, 'utf8')
      } catch {
        return null
      }
    },
  }
}

/**
 * Start the installed app, detached, so it outlives the tool call and the
 * server that started it: closing Claude Code must not close the piano.
 */
export function nodeLaunch(place: Place = nodePlace()): () => Promise<Launched> {
  return () => {
    const found = findApp(place)
    if (found === null) {
      return Promise.resolve({ started: false, where: whereLooked(place) })
    }
    spawn(found.command, [...found.args], { detached: true, stdio: 'ignore' }).unref()
    return Promise.resolve({ started: true, from: found.from })
  }
}

/** The link to the running app, over loopback, as Node reaches it. */
export function nodeLink(directory: string = defaultPresenceDirectory()): Link {
  return createLink({
    directory,
    launch: nodeLaunch(),
    list: (dir) => readdir(dir),
    read: (path) => readFile(path, 'utf8'),
    alive: processAlive,
    post: async (url, request) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: request.headers,
        body: request.body,
        // A window that takes this long is not going to answer.
        signal: AbortSignal.timeout(10_000),
      })
      return { status: response.status, text: await response.text() }
    },
  })
}

/** Start talking over stdin and stdout, which is how Claude Code starts one. */
export async function start(root: string = defaultLibraryRoot()): Promise<McpServer> {
  const server = createServer({ library: createLibrary(root, nodeFiles), link: nodeLink() })
  await server.connect(new StdioServerTransport())
  return server
}
