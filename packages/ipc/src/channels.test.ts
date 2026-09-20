import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { allChannels, appInfo, formatIssues, windowSetTitle } from './channels'
import { CHANNEL_NAMES } from './names'

describe('the channel contract', () => {
  it('declares every channel exactly once', () => {
    const names = allChannels.map((channel) => channel.channel)
    expect(new Set(names).size).toBe(names.length)
  })

  it('keeps the names module and the schemas in step', () => {
    // The preload imports only the names, so a channel renamed in one place
    // and not the other fails at runtime in whichever screen calls it first.
    expect(allChannels.map((c) => c.channel).sort()).toEqual(Object.values(CHANNEL_NAMES).sort())
  })

  it('gives every channel a request and a response schema', () => {
    for (const channel of allChannels) {
      expect(channel.request).toBeInstanceOf(z.ZodType)
      expect(channel.response).toBeInstanceOf(z.ZodType)
    }
  })
})

describe('window:set-title', () => {
  it('accepts a title', () => {
    expect(windowSetTitle.request.parse({ title: 'Piano' })).toEqual({ title: 'Piano' })
  })

  it.each([
    ['a number', { title: 123 }],
    ['nothing at all', {}],
    ['null', null],
    ['an empty string', { title: '' }],
    ['a title longer than the limit', { title: 'x'.repeat(201) }],
  ])('refuses %s', (_label, payload) => {
    expect(windowSetTitle.request.safeParse(payload).success).toBe(false)
  })
})

describe('app:info', () => {
  it('takes no payload', () => {
    expect(appInfo.request.safeParse(null).success).toBe(true)
    expect(appInfo.request.safeParse({ anything: true }).success).toBe(false)
  })

  it('requires every version field on the way out', () => {
    expect(appInfo.response.safeParse({ electron: '44', chrome: '152', node: '24' }).success).toBe(
      false,
    )
  })
})

describe('formatIssues', () => {
  it('names the field and the reason, because a model reads this next', () => {
    const result = windowSetTitle.request.safeParse({ title: 123 })
    expect(result.success).toBe(false)
    if (result.success) {
      return
    }
    const message = formatIssues(result.error)
    expect(message).toContain('title')
    expect(message).toMatch(/expected string/i)
  })

  it('calls the whole payload <root> when the failure is not in a field', () => {
    const result = windowSetTitle.request.safeParse(null)
    expect(result.success).toBe(false)
    if (result.success) {
      return
    }
    expect(formatIssues(result.error)).toContain('<root>')
  })
})
