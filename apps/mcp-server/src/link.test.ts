import {
  commandSchema,
  LINK_PROTOCOL,
  presenceFileName,
  TOKEN_HEADER,
  type Presence,
} from '@piano/ipc'
import { LEVELS } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { createLink, NO_WINDOW, windowsIn, type LinkDeps } from './link'

/**
 * Finding the window in front of the person, with the filesystem, the process
 * table and the network handed in. The claim under test is the one the line
 * makes: a tool call reaches the window somebody is looking at, and nothing
 * else.
 */

const directory = '/presence'

function window(over: Partial<Presence> = {}): Presence {
  return {
    protocol: LINK_PROTOCOL,
    endpoint: 'http://127.0.0.1:50000',
    token: 't'.repeat(48),
    pid: 100,
    focusedAt: 1000,
    app: '0.0.0',
    ...over,
  }
}

function setup(
  windows: readonly Presence[],
  options: {
    readonly dead?: readonly number[]
    readonly files?: Record<string, string>
    readonly answer?: { readonly status: number; readonly text: string } | 'unreachable'
  } = {},
) {
  const files = new Map<string, string>(Object.entries(options.files ?? {}))
  for (const one of windows) {
    files.set(`${directory}/${presenceFileName(one.pid)}`, JSON.stringify(one))
  }
  const posted: { url: string; headers: Readonly<Record<string, string>>; body: string }[] = []
  const deps: LinkDeps = {
    directory,
    list: () => Promise.resolve([...files.keys()].map((path) => path.slice(directory.length + 1))),
    read: (path) => {
      const text = files.get(path)
      return text === undefined ? Promise.reject(new Error('gone')) : Promise.resolve(text)
    },
    alive: (pid) => !(options.dead ?? []).includes(pid),
    post: (url, request) => {
      posted.push({ url, ...request })
      const answer = options.answer ?? {
        status: 200,
        text: JSON.stringify({ ok: true, text: 'Playing.' }),
      }
      return answer === 'unreachable'
        ? Promise.reject(new Error('ECONNREFUSED'))
        : Promise.resolve(answer)
    },
  }
  return { link: createLink(deps), deps, posted }
}

describe('finding the window', () => {
  it('speaks to the one focused most recently, which is the one in front of the person', async () => {
    const { link, posted } = setup([
      window({ pid: 1, endpoint: 'http://127.0.0.1:50001', focusedAt: 1000 }),
      window({ pid: 2, endpoint: 'http://127.0.0.1:50002', focusedAt: 5000 }),
      window({ pid: 3, endpoint: 'http://127.0.0.1:50003', focusedAt: 3000 }),
    ])
    await link.send({ kind: 'play' })
    expect(posted[0]?.url).toBe('http://127.0.0.1:50002/command')
  })

  it('passes over a window a crash left behind, however recently it was focused', async () => {
    const { link, posted } = setup(
      [
        window({ pid: 1, endpoint: 'http://127.0.0.1:50001', focusedAt: 1000 }),
        window({ pid: 2, endpoint: 'http://127.0.0.1:50002', focusedAt: 9000 }),
      ],
      { dead: [2] },
    )
    await link.send({ kind: 'play' })
    expect(posted[0]?.url).toBe('http://127.0.0.1:50001/command')
  })

  it('ignores files that are torn, foreign or not presence files at all', async () => {
    const { deps } = setup([window()], {
      files: {
        [`${directory}/window-7.json`]: '{"half":',
        [`${directory}/window-8.json`]: JSON.stringify({ endpoint: 'nowhere' }),
        [`${directory}/notes.txt`]: 'hello',
      },
    })
    expect((await windowsIn(deps)).map((one) => one.pid)).toEqual([100])
  })

  it('says no window is listening rather than failing, when none is', async () => {
    const { link, posted } = setup([])
    expect(await link.send({ kind: 'play' })).toEqual({ ok: false, text: NO_WINDOW })
    expect(posted).toHaveLength(0)
  })
})

describe('speaking to it', () => {
  it('carries the window’s token and this side’s version with the command', async () => {
    const { link, posted } = setup([window()])
    const answer = await link.send({ kind: 'tempo', scale: 0.5 })

    expect(answer).toEqual({ ok: true, text: 'Playing.' })
    expect(posted[0]?.headers[TOKEN_HEADER]).toBe('t'.repeat(48))
    expect(JSON.parse(posted[0]?.body ?? '{}')).toEqual({
      protocol: LINK_PROTOCOL,
      command: { kind: 'tempo', scale: 0.5 },
    })
  })

  it('says which side to update when the app speaks another version, and sends nothing', async () => {
    const { link, posted } = setup([window({ protocol: LINK_PROTOCOL + 1 })])
    const answer = await link.send({ kind: 'play' })

    expect(answer.ok).toBe(false)
    expect(answer.text).toContain('Update the plugin')
    expect(posted).toHaveLength(0)
  })

  it('passes a refusal from the app on as the app worded it', async () => {
    const { link } = setup([window()], {
      answer: { status: 409, text: 'Update the piano app: it is the older of the two.' },
    })
    expect((await link.send({ kind: 'play' })).text).toContain('Update the piano app')
  })

  it('explains a refused token as an app restarted since it was found', async () => {
    const { link } = setup([window()], { answer: { status: 401, text: '' } })
    expect((await link.send({ kind: 'play' })).text).toContain('restarted')
  })

  it('says the window did not answer, rather than throwing, when it has gone', async () => {
    const { link } = setup([window()], { answer: 'unreachable' })
    const answer = await link.send({ kind: 'play' })
    expect(answer.ok).toBe(false)
    expect(answer.text).toContain('did not answer')
  })
})

describe('the commands the tools send', () => {
  it('can name every level the format knows', () => {
    for (const level of LEVELS) {
      expect(commandSchema.safeParse({ kind: 'level', level }).success, level).toBe(true)
    }
  })
})
