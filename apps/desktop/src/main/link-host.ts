import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'

import {
  commandSchema,
  envelopeSchema,
  formatIssues,
  LINK_PROTOCOL,
  presenceFileName,
  protocolMismatch,
  TOKEN_HEADER,
  type Command,
  type LinkResult,
  type Presence,
} from '@piano/ipc'

/**
 * Where Claude Code's requests come in.
 *
 * The app listens on loopback, on a port the system picks, and leaves a small
 * presence file saying so — the address, a token, its process id and when it
 * was last focused — for the MCP server to find. The file goes when the app
 * does. A file a crash left behind is the server's problem to notice, by
 * checking the process is still there, rather than something to trust.
 *
 * Every request is refused unless it carries the token and speaks this
 * version of the link, and only then is the command parsed against the shared
 * schema. Nothing that arrives here is believed because it arrived: a port on
 * loopback is reachable by anything else running as this person.
 *
 * Nothing here knows about Electron. What becomes of a command is `send`'s
 * business, which is what keeps this testable without a window.
 */

/** A request larger than this is not a command; commands are a few hundred bytes. */
const MAX_BODY = 64 * 1024

export type LinkHost = {
  readonly endpoint: string
  readonly file: string
  /** Say this window was just focused, which is what makes it the one spoken to. */
  readonly focused: () => Promise<void>
  /** Stop listening and take the presence file away. */
  readonly close: () => Promise<void>
}

export async function startLinkHost(options: {
  /** The directory presence files are left in. */
  readonly directory: string
  readonly pid: number
  /** The app's version, for a message that has to say which side is old. */
  readonly app: string
  readonly send: (command: Command) => Promise<LinkResult>
  readonly now?: () => number
}): Promise<LinkHost> {
  const now = options.now ?? (() => Date.now())
  const token = randomBytes(24).toString('hex')
  const file = join(options.directory, presenceFileName(options.pid))

  const server = createServer((request, response) => {
    void answer(request, response, token, options.send)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      resolve()
    })
  })
  const { port } = server.address() as AddressInfo
  const endpoint = `http://127.0.0.1:${String(port)}`

  const announce = async () => {
    const presence: Presence = {
      protocol: LINK_PROTOCOL,
      endpoint,
      token,
      pid: options.pid,
      focusedAt: now(),
      app: options.app,
    }
    await mkdir(options.directory, { recursive: true })
    await writeFile(file, `${JSON.stringify(presence)}\n`, { encoding: 'utf8', mode: 0o600 })
  }
  await announce()

  return {
    endpoint,
    file,
    focused: announce,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      })
      await rm(file, { force: true })
    },
  }
}

function reply(response: ServerResponse, status: number, body: LinkResult | string): void {
  const json = typeof body !== 'string'
  response.writeHead(status, {
    'content-type': json ? 'application/json' : 'text/plain; charset=utf-8',
  })
  response.end(json ? JSON.stringify(body) : body)
}

/** Whether the token matches, compared in constant time so it cannot be guessed a byte at a time. */
function tokenMatches(given: string | string[] | undefined, token: string): boolean {
  if (typeof given !== 'string' || given.length !== token.length) {
    return false
  }
  return timingSafeEqual(Buffer.from(given), Buffer.from(token))
}

async function readBody(request: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const piece = chunk as Buffer
    size += piece.length
    if (size > MAX_BODY) {
      return null
    }
    chunks.push(piece)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function answer(
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
  send: (command: Command) => Promise<LinkResult>,
): Promise<void> {
  if (request.method !== 'POST' || request.url !== '/command') {
    reply(response, 404, 'There is one thing to ask here: POST /command.')
    return
  }
  if (!tokenMatches(request.headers[TOKEN_HEADER], token)) {
    reply(response, 401, 'That request did not carry this window’s token.')
    return
  }
  const body = await readBody(request)
  if (body === null) {
    reply(response, 413, 'That request is far larger than any command.')
    return
  }

  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    reply(response, 400, 'That request is not JSON.')
    return
  }
  const envelope = envelopeSchema.safeParse(raw)
  if (!envelope.success) {
    reply(response, 400, `That request is not a command: ${formatIssues(envelope.error)}`)
    return
  }
  // The version before the command, so a newer plugin is told to update the
  // app rather than told its command does not exist.
  if (envelope.data.protocol !== LINK_PROTOCOL) {
    reply(
      response,
      409,
      protocolMismatch({
        us: 'piano app',
        ours: LINK_PROTOCOL,
        them: 'plugin',
        theirs: envelope.data.protocol,
      }),
    )
    return
  }
  const command = commandSchema.safeParse(envelope.data.command)
  if (!command.success) {
    reply(response, 400, `The piano does not know that command: ${formatIssues(command.error)}`)
    return
  }

  try {
    reply(response, 200, await send(command.data))
  } catch (cause: unknown) {
    reply(response, 200, {
      ok: false,
      text: `The piano window could not do that: ${cause instanceof Error ? cause.message : String(cause)}`,
    })
  }
}
