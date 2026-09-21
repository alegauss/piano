import {
  isPresenceFile,
  LINK_PROTOCOL,
  linkResultSchema,
  presenceSchema,
  protocolMismatch,
  TOKEN_HEADER,
  type Command,
  type LinkResult,
  type Presence,
} from '@piano/ipc'

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
}

/** Said when nothing is listening, which is not a failure of the request. */
export const NO_WINDOW =
  'No piano window is listening. Open the Piano app and ask again; the tools that read and ' +
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

export function createLink(deps: LinkDeps): Link {
  return {
    send: async (command) => {
      const [window] = await windowsIn(deps)
      if (window === undefined) {
        return { ok: false, text: NO_WINDOW }
      }
      if (window.protocol !== LINK_PROTOCOL) {
        return {
          ok: false,
          text: protocolMismatch({
            us: 'plugin',
            ours: LINK_PROTOCOL,
            them: 'piano app',
            theirs: window.protocol,
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
