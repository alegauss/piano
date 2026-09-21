import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js'
import type { BrowserCommand } from 'vitest/node'

/**
 * The chain from a request to a window playing it, run for real.
 *
 * What a person does is ask Claude Code for a piece; what Claude Code does is
 * call the plugin's tools. This replays those calls: the score a model wrote
 * for the request, validated, saved and played through the plugin's own
 * bundled server over stdio, exactly as Claude Code starts it, against the
 * built app opened with its own profile. Nothing is faked between the request
 * and the window: the server, the link, the app, the library and the open are
 * the shipped ones. The model is the one part replaced, by a recording of what
 * it wrote, so this runs in CI; `npm run premise:record` makes a new recording
 * from a live run.
 *
 * It runs in Node as a browser command, because what comes after — hearing
 * the opening bars — needs Web Audio, which only the browser half has.
 */

const appDir = fileURLToPath(new URL('../..', import.meta.url))
const repoRoot = join(appDir, '..', '..')

/** The plugin's server, as Claude Code starts it. */
export const PLUGIN_SERVER = join(repoRoot, 'plugin', 'server', 'piano-mcp.cjs')

/** The request and what a model wrote for it. */
export const RECORDING = join(appDir, 'src', 'test', 'premise', 'recording.json')

export type Recording = {
  readonly request: string
  readonly recordedWith: string
  readonly score: unknown
}

/** One tool's answer, as the caller reads it. */
export type Answer = {
  readonly tool: string
  readonly ok: boolean
  readonly text: string
  readonly data: unknown
}

export type PremiseRun = {
  readonly request: string
  readonly answers: readonly Answer[]
  /** The file the library holds for the saved score, as JSON. */
  readonly saved: unknown
}

const WINDOW_TIMEOUT_MS = 60_000

async function waitFor(check: () => Promise<boolean>, what: string): Promise<void> {
  const until = Date.now() + WINDOW_TIMEOUT_MS
  while (Date.now() < until) {
    if (await check()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`${what} did not happen within ${String(WINDOW_TIMEOUT_MS / 1000)} s`)
}

function answerOf(tool: string, result: Awaited<ReturnType<Client['callTool']>>): Answer {
  const content = Array.isArray(result.content) ? (result.content as { text?: unknown }[]) : []
  const structured = result.structuredContent as { result?: unknown } | undefined
  return {
    tool,
    ok: result.isError !== true,
    text: content.map((one) => (typeof one.text === 'string' ? one.text : '')).join('\n'),
    data: structured?.result,
  }
}

export async function runPremise(recording: Recording): Promise<PremiseRun> {
  if (!existsSync(PLUGIN_SERVER)) {
    throw new Error('the plugin server is not built: run `npm run plugin`')
  }
  const root = await mkdtemp(join(tmpdir(), 'piano-premise-'))
  const library = join(root, 'library')
  const windows = join(root, 'windows')
  await mkdir(library, { recursive: true })

  const require = createRequire(import.meta.url)
  const electron = require('electron') as unknown as string
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PIANO_LIBRARY: library,
    PIANO_PRESENCE_DIR: windows,
    PIANO_USER_DATA_DIR: join(root, 'profile'),
  }
  // Inherited from an editor's terminal, this turns electron into plain node.
  delete env['ELECTRON_RUN_AS_NODE']
  const app = spawn(electron, ['.'], { cwd: appDir, env, stdio: 'ignore' })
  let exited = false
  app.once('exit', () => {
    exited = true
  })

  const client = new Client({ name: 'piano-premise', version: '1.0.0' })
  try {
    // The window says it is there once it can hear a command, which is the
    // moment a person would be looking at it.
    await waitFor(async () => {
      if (exited) {
        throw new Error('the app exited before its window was listening')
      }
      // The file is made empty, closed to other users, then filled: it counts
      // once it says where to reach the window.
      const names = await readdir(windows).catch((): string[] => [])
      for (const name of names.filter((one) => one.endsWith('.json'))) {
        const text = await readFile(join(windows, name), 'utf8').catch(() => '')
        if (text.includes('"endpoint"')) {
          return true
        }
      }
      return false
    }, 'the app window listening')

    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [PLUGIN_SERVER],
        env: { ...getDefaultEnvironment(), PIANO_LIBRARY: library, PIANO_PRESENCE_DIR: windows },
        stderr: 'ignore',
      }),
    )
    const call = async (tool: string, args: Record<string, unknown>) =>
      answerOf(tool, await client.callTool({ name: tool, arguments: args }))

    // What /piano:compose asks for, in its order: check it, keep it, play it by
    // the id it was kept under, then ask the window what it is doing.
    const answers: Answer[] = []
    answers.push(await call('validate_score', { score: recording.score }))
    const saved = await call('save_score', { score: recording.score })
    answers.push(saved)
    const id = (saved.data as { id?: unknown } | undefined)?.id
    if (typeof id === 'string') {
      answers.push(await call('play', { score: id }))
      await new Promise((resolve) => setTimeout(resolve, 500))
      answers.push(await call('piano_state', {}))
      answers.push(await call('stop', {}))
    }

    // The file the save answered with, beside whatever the app ships into the library.
    // Spelled out rather than imported: the config that loads this file runs on
    // Node's own loader, which cannot read the workspace's TypeScript packages.
    const kept =
      typeof id === 'string'
        ? (JSON.parse(await readFile(join(library, `${id}.piano`), 'utf8')) as unknown)
        : null
    return { request: recording.request, answers, saved: kept }
  } finally {
    await client.close().catch(() => {})
    app.kill()
    await waitFor(() => Promise.resolve(exited), 'the app closing').catch(() => {})
    await rm(root, { recursive: true, force: true }).catch(() => {})
  }
}

/** The browser test's way in: run the chain on the recording and hand back what came of it. */
export const premiseRun: BrowserCommand<[]> = async () => {
  const recording = JSON.parse(await readFile(RECORDING, 'utf8')) as Recording
  return runPremise(recording)
}
