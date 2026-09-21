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
import { PLUGIN_VERSION } from './version'

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
    /**
     * What starting the app does: its window appears after so many looks, it
     * never appears, or there is no app to start.
     */
    readonly launch?: { readonly appearsAfter: number } | 'never' | 'not installed'
  } = {},
) {
  const files = new Map<string, string>(Object.entries(options.files ?? {}))
  for (const one of windows) {
    files.set(`${directory}/${presenceFileName(one.pid)}`, JSON.stringify(one))
  }
  const posted: { url: string; headers: Readonly<Record<string, string>>; body: string }[] = []
  let launches = 0
  let looks = 0
  const started = window({ pid: 900, endpoint: 'http://127.0.0.1:59000' })
  const launch = options.launch
  const deps: LinkDeps = {
    directory,
    ...(launch === undefined
      ? {}
      : {
          launch: () => {
            launches += 1
            return Promise.resolve(
              launch === 'not installed'
                ? { started: false as const, where: 'C:\\Programs\\Piano\\Piano.exe' }
                : { started: true as const, from: 'the default install location' },
            )
          },
          sleep: () => {
            looks += 1
            if (typeof launch === 'object' && looks >= launch.appearsAfter) {
              files.set(`${directory}/${presenceFileName(started.pid)}`, JSON.stringify(started))
            }
            return Promise.resolve()
          },
          launchTimeoutMs: 2_000,
        }),
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
  return { link: createLink(deps), deps, posted, launches: () => launches }
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
    // By the numbers a person can find: this plugin's release, and the app's.
    expect(answer.text).toContain(`plugin (${PLUGIN_VERSION})`)
    expect(answer.text).toContain(`piano app (${window().app})`)
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

describe('a request with no window open', () => {
  it('starts the app, waits for it to listen, and plays there', async () => {
    const { link, posted, launches } = setup([], { launch: { appearsAfter: 3 } })
    const answer = await link.send({ kind: 'play' })

    expect(answer.ok).toBe(true)
    expect(launches()).toBe(1)
    expect(posted[0]?.url).toBe('http://127.0.0.1:59000/command')
  })

  it('does not start the app to answer what is open', async () => {
    const { link, launches } = setup([], { launch: { appearsAfter: 1 } })
    expect(await link.send({ kind: 'state' })).toEqual({ ok: false, text: NO_WINDOW })
    expect(launches()).toBe(0)
  })

  it('starts it once for requests that arrive together, never twice', async () => {
    const { link, launches, posted } = setup([], { launch: { appearsAfter: 4 } })
    const answers = await Promise.all([
      link.send({ kind: 'play' }),
      link.send({ kind: 'tempo', scale: 0.5 }),
      link.send({ kind: 'level', level: 'beginner' }),
    ])

    expect(answers.every((one) => one.ok)).toBe(true)
    expect(launches()).toBe(1)
    expect(posted).toHaveLength(3)
  })

  it('does not start it again when a window is already there', async () => {
    const { link, launches } = setup([window()], { launch: { appearsAfter: 1 } })
    await link.send({ kind: 'play' })
    expect(launches()).toBe(0)
  })

  it('says where it looked and where to get the app when it is not installed', async () => {
    const { link } = setup([], { launch: 'not installed' })
    const answer = await link.send({ kind: 'play' })
    expect(answer.ok).toBe(false)
    expect(answer.text).toContain('Programs\\Piano\\Piano.exe')
    expect(answer.text).toContain('releases')
  })

  it('gives up with a clear sentence when the app starts and never listens', async () => {
    const { link } = setup([], { launch: 'never' })
    const answer = await link.send({ kind: 'play' })
    expect(answer.ok).toBe(false)
    expect(answer.text).toContain('did not say it was listening within 2 seconds')
  })
})

describe('the commands the tools send', () => {
  it('can name every level the format knows', () => {
    for (const level of LEVELS) {
      expect(commandSchema.safeParse({ kind: 'level', level }).success, level).toBe(true)
    }
  })
})
