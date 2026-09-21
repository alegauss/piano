import {
  isPresenceFile,
  LINK_PROTOCOL,
  linkResultSchema,
  needsWindow,
  presenceSchema,
  protocolMismatch,
  TOKEN_HEADER,
  type Command,
  type LinkResult,
  type Presence,
} from '@piano/ipc'

import { PLUGIN_VERSION } from './version'

export type { Command, DrillAsk, LinkResult, PassageAsk } from '@piano/ipc'

/**
 * The way to the window somebody is looking at.
 *
 * The tools are one half of the premise and this is the other: a sentence
 * makes a piano play only if the sentence reaches the piano. Every running app
 * leaves a presence file saying where it listens; this reads them, drops the
 * ones a crash left behind, and speaks to the one focused most recently,
 * because that is the window in front of the person. Speaking to any other
 * would be the worst failure there is here: a tool call that succeeds while
 * something plays in a window nobody can see.
 *
 * What is said is the shared contract's closed set of commands, and nothing
 * else can be.
 */

export type Link = {
  readonly send: (command: Command) => Promise<LinkResult>
}

/** What the link needs of the machine. Node's in the server, fakes in a test. */
export type LinkDeps = {
  /** The directory presence files are left in. */
  readonly directory: string
  readonly list: (directory: string) => Promise<readonly string[]>
  readonly read: (path: string) => Promise<string>
  /** Whether a process is still running, which is how a stale file is told from a live one. */
  readonly alive: (pid: number) => boolean
  readonly post: (
    url: string,
    request: { readonly headers: Readonly<Record<string, string>>; readonly body: string },
  ) => Promise<{ readonly status: number; readonly text: string }>
  /**
   * Start the installed app, or say why not. Without it a request with no
   * window open is answered with where to get the app.
   */
  readonly launch?: () => Promise<Launched>
  readonly sleep?: (ms: number) => Promise<void>
  /** How long a started app has to say it is listening. */
  readonly launchTimeoutMs?: number
}

export type Launched =
  | { readonly started: true; readonly from: string }
  | { readonly started: false; readonly where: string }

/** Long enough for a cold start on a slow disk, short enough that a model is not left hanging. */
export const LAUNCH_TIMEOUT_MS = 30_000

/** How often a starting app is looked for. */
const POLL_MS = 250

/**
 * Where the app is had from, for somebody who has the plugin and not the
 * piano: the newest release, with an installer for each system attached.
 */
export const APP_RELEASES = 'https://github.com/alegauss/piano/releases/latest'

/**
 * Said when nothing is listening, which is not a failure of the request.
 *
 * It tells somebody how to get the app rather than that a socket was refused:
 * the plugin is often installed first, and "connection refused" to a person
 * who has never had the app is a message about the wrong problem.
 */
export const NO_WINDOW =
  'No piano window is listening. If the Piano app is not installed, get it from ' +
  `${APP_RELEASES}, or build it from the repository with "npm install" and ` +
  '"npm run package". If it is installed, open it and ask again. The tools that read and ' +
  'write scores work without it.'

/**
 * What every transport tool answers when there is no link at all.
 *
 * Said plainly rather than as a failure, because the caller is a model that
 * will otherwise try the same tool again: there is nothing wrong with the
 * request, there is nothing at the other end of it.
 */
export function noWindow(): Link {
  return { send: () => Promise.resolve({ ok: false, text: NO_WINDOW }) }
}

/** The windows that are really there, most recently focused first. */
export async function windowsIn(deps: LinkDeps): Promise<Presence[]> {
  const names = await deps.list(deps.directory).catch((): readonly string[] => [])
  const found: Presence[] = []
  for (const name of names.filter(isPresenceFile)) {
    try {
      const presence = presenceSchema.safeParse(
        JSON.parse(await deps.read(`${deps.directory}/${name}`)),
      )
      if (presence.success && deps.alive(presence.data.pid)) {
        found.push(presence.data)
      }
    } catch {
      // A file half-written by an app that is starting, or left torn by one
      // that crashed, is not a window.
      continue
    }
  }
  return found.sort((one, other) => other.focusedAt - one.focusedAt)
}

/** Said when the app was looked for to start it, and is not there. */
export function notInstalled(where: string): string {
  return (
    `No piano window is listening, and the Piano app is not installed where this plugin ` +
    `looked (${where}). Get it from ${APP_RELEASES}, or set PIANO_APP to where it is.`
  )
}

export function createLink(deps: LinkDeps): Link {
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const timeout = deps.launchTimeoutMs ?? LAUNCH_TIMEOUT_MS

  /**
   * Start the app and wait until its window says it is listening. Shared by
   * every request that arrives meanwhile, so two tool calls racing a cold
   * start launch it once; the app refuses a second instance besides.
   */
  let starting: Promise<Presence | LinkResult> | null = null
  const bringUp = async (launch: () => Promise<Launched>): Promise<Presence | LinkResult> => {
    const launched = await launch()
    if (!launched.started) {
      return { ok: false, text: notInstalled(launched.where) }
    }
    for (let waited = 0; waited < timeout; waited += POLL_MS) {
      const [window] = await windowsIn(deps)
      if (window !== undefined) {
        return window
      }
      await sleep(POLL_MS)
    }
    return {
      ok: false,
      text:
        `The Piano app was started (from ${launched.from}) but did not say it was listening ` +
        `within ${String(Math.round(timeout / 1000))} seconds. If it is open now, ask again.`,
    }
  }

  const windowFor = async (command: Command): Promise<Presence | LinkResult> => {
    const [window] = await windowsIn(deps)
    if (window !== undefined) {
      return window
    }
    // Asking what is open is not a reason to open anything.
    if (!needsWindow(command) || deps.launch === undefined) {
      return { ok: false, text: NO_WINDOW }
    }
    const launch = deps.launch
    starting ??= bringUp(launch).finally(() => {
      starting = null
    })
    return starting
  }

  return {
    send: async (command) => {
      const found = await windowFor(command)
      if ('ok' in found) {
        return found
      }
      const window = found
      if (window.protocol !== LINK_PROTOCOL) {
        return {
          ok: false,
          text: protocolMismatch({
            us: 'plugin',
            ours: LINK_PROTOCOL,
            ourRelease: PLUGIN_VERSION,
            them: 'piano app',
            theirs: window.protocol,
            theirRelease: window.app,
          }),
        }
      }

      let answer: { readonly status: number; readonly text: string }
      try {
        answer = await deps.post(`${window.endpoint}/command`, {
          headers: { 'content-type': 'application/json', [TOKEN_HEADER]: window.token },
          body: JSON.stringify({ protocol: LINK_PROTOCOL, command }),
        })
      } catch {
        return {
          ok: false,
          text: 'The piano window did not answer. If it was closed a moment ago, open it and ask again.',
        }
      }
      return answered(answer)
    },
  }
}

/**
 * What came back, as the caller reads it.
 *
 * The app writes its refusals as sentences already, so a refusal is passed on
 * as it is rather than rephrased into something vaguer here.
 */
function answered(answer: { readonly status: number; readonly text: string }): LinkResult {
  if (answer.status === 200) {
    try {
      const result = linkResultSchema.safeParse(JSON.parse(answer.text))
      if (result.success) {
        return result.data
      }
    } catch {
      // Falls through to the sentence below.
    }
    return { ok: false, text: 'The piano window answered with something this plugin cannot read.' }
  }
  if (answer.status === 401) {
    return {
      ok: false,
      text: 'The piano window refused the request: the app was restarted since it was found. Ask again.',
    }
  }
  return {
    ok: false,
    text: answer.text === '' ? `The piano window said ${String(answer.status)}.` : answer.text,
  }
}
