import type { LinkCommandPush } from '@piano/ipc'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRelay } from './link-relay'

/**
 * Questions and answers matched by id, which is the whole of what the relay
 * does and the whole of what can go wrong with it: an answer given to the
 * wrong question, or a question that waits for ever.
 */

afterEach(() => {
  vi.useRealTimers()
})

function counting() {
  let next = 0
  return () => `q${String((next += 1))}`
}

describe('the relay', () => {
  it('hands the command to the window and resolves with its answer', async () => {
    const pushed: LinkCommandPush[] = []
    const relay = createRelay((message) => pushed.push(message) > 0, { id: counting() })

    const answer = relay.relay({ kind: 'stop' })
    expect(pushed).toEqual([{ id: 'q1', command: { kind: 'stop' } }])
    relay.answer('q1', { ok: true, text: 'Stopped.' })

    expect(await answer).toEqual({ ok: true, text: 'Stopped.' })
  })

  it('matches each answer to its own question', async () => {
    const relay = createRelay(() => true, { id: counting() })
    const first = relay.relay({ kind: 'play' })
    const second = relay.relay({ kind: 'stop' })

    relay.answer('q2', { ok: true, text: 'second' })
    relay.answer('q1', { ok: true, text: 'first' })

    expect((await first).text).toBe('first')
    expect((await second).text).toBe('second')
  })

  it('says the window is closed when there is none to hand it to', async () => {
    const relay = createRelay(() => false)
    expect(await relay.relay({ kind: 'play' })).toEqual({
      ok: false,
      text: 'The piano window is closed.',
    })
  })

  it('answers for a window that never does, rather than leaving the caller waiting', async () => {
    vi.useFakeTimers()
    const relay = createRelay(() => true, { timeoutMs: 100 })
    const answer = relay.relay({ kind: 'play' })
    vi.advanceTimersByTime(100)
    expect((await answer).text).toContain('did not answer')
  })

  it('drops an answer that arrives after the question was given up on', async () => {
    vi.useFakeTimers()
    const relay = createRelay(() => true, { timeoutMs: 100, id: counting() })
    const answer = relay.relay({ kind: 'play' })
    vi.advanceTimersByTime(100)
    relay.answer('q1', { ok: true, text: 'too late' })
    expect((await answer).ok).toBe(false)
  })
})
