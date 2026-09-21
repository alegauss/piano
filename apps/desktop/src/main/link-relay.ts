import { randomUUID } from 'node:crypto'

import type { Command, LinkCommandPush, LinkResult } from '@piano/ipc'

/**
 * A command handed to the window, and its answer handed back.
 *
 * The window is where playback lives, so main cannot answer a command itself:
 * it pushes the command across and waits for the window to say what became of
 * it, matched by an id. A window that never answers — closed mid-request, or
 * busy with something that hung — is answered for after a while, because the
 * caller at the other end is a model waiting on a tool call.
 */

/** Long enough for a window to act, short enough that a hung one is noticed. */
export const ANSWER_TIMEOUT_MS = 5_000

export type Relay = {
  /** Hand a command to the window and wait for what it says. */
  readonly relay: (command: Command) => Promise<LinkResult>
  /** The window's answer, by the id the command went out with. */
  readonly answer: (id: string, result: LinkResult) => void
}

export function createRelay(
  /** Push to the window, or say there is none to push to. */
  push: (message: LinkCommandPush) => boolean,
  options: { readonly timeoutMs?: number; readonly id?: () => string } = {},
): Relay {
  const waiting = new Map<string, (result: LinkResult) => void>()
  const makeId = options.id ?? randomUUID
  const timeoutMs = options.timeoutMs ?? ANSWER_TIMEOUT_MS

  return {
    relay: (command) =>
      new Promise((resolve) => {
        const id = makeId()
        const timer = setTimeout(() => {
          waiting.delete(id)
          resolve({ ok: false, text: 'The piano window did not answer in time.' })
        }, timeoutMs)
        waiting.set(id, (result) => {
          clearTimeout(timer)
          waiting.delete(id)
          resolve(result)
        })
        if (!push({ id, command })) {
          waiting.get(id)?.({ ok: false, text: 'The piano window is closed.' })
        }
      }),
    answer: (id, result) => {
      // An answer nobody is waiting for came too late; there is no one to tell.
      waiting.get(id)?.(result)
    },
  }
}
