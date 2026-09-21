import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { LINK_PROTOCOL, presenceSchema, TOKEN_HEADER, type Command } from '@piano/ipc'
import { afterEach, describe, expect, it } from 'vitest'

import { startLinkHost, type LinkHost } from './link-host'

/**
 * The host on a real loopback port, spoken to the way the MCP server speaks
 * to it. Every refusal here is a request that must not reach the window: no
 * token, another version, something that is not one of the eight commands.
 */

let host: LinkHost | null = null
let directory = ''

afterEach(async () => {
  await host?.close()
  host = null
  await rm(directory, { recursive: true, force: true })
})

async function setup(now = () => 1000) {
  directory = await mkdtemp(join(tmpdir(), 'piano-presence-'))
  const heard: Command[] = []
  host = await startLinkHost({
    directory,
    pid: 4242,
    app: '1.2.3',
    now,
    send: (command) => {
      heard.push(command)
      return Promise.resolve({ ok: true, text: `did ${command.kind}` })
    },
  })
  const presence = presenceSchema.parse(JSON.parse(await readFile(host.file, 'utf8')))
  const ask = (body: unknown, token: string = presence.token) =>
    fetch(`${presence.endpoint}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [TOKEN_HEADER]: token },
      body: JSON.stringify(body),
    })
  return { host, heard, presence, ask }
}

describe('telling the MCP server where the window is', () => {
  it('leaves a presence file with a loopback address, a token and this process', async () => {
    const { presence } = await setup()
    expect(presence.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(presence.pid).toBe(4242)
    expect(presence.protocol).toBe(LINK_PROTOCOL)
    expect(presence.app).toBe('1.2.3')
  })

  it('says when it was focused, which is what picks it over another window', async () => {
    let clock = 1000
    const { host: open } = await setup(() => clock)
    clock = 9000
    await open.focused()
    const presence = presenceSchema.parse(JSON.parse(await readFile(open.file, 'utf8')))
    expect(presence.focusedAt).toBe(9000)
  })

  it('takes the file away when it closes, so nothing is sent to a window that has gone', async () => {
    const { host: open } = await setup()
    await open.close()
    expect(existsSync(open.file)).toBe(false)
    host = null
  })
})

describe('taking a command', () => {
  it('hands a command to the window and returns what the window said', async () => {
    const { ask, heard } = await setup()
    const response = await ask({ protocol: LINK_PROTOCOL, command: { kind: 'stop' } })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, text: 'did stop' })
    expect(heard).toEqual([{ kind: 'stop' }])
  })

  it('refuses a request without the token, and the window never hears of it', async () => {
    const { ask, heard } = await setup()
    const response = await ask(
      { protocol: LINK_PROTOCOL, command: { kind: 'stop' } },
      'x'.repeat(48),
    )
    expect(response.status).toBe(401)
    expect(heard).toEqual([])
  })

  it('answers another version with which side to update, before reading the command', async () => {
    const { ask, heard } = await setup()
    const response = await ask({
      protocol: LINK_PROTOCOL + 1,
      command: { kind: 'from the future' },
    })

    expect(response.status).toBe(409)
    expect(await response.text()).toContain('Update the piano app')
    expect(heard).toEqual([])
  })

  it('refuses anything that is not one of the commands, saying which field was wrong', async () => {
    const { ask, heard } = await setup()
    const response = await ask({ protocol: LINK_PROTOCOL, command: { kind: 'run', script: 'x' } })

    expect(response.status).toBe(400)
    expect(await response.text()).toContain('kind')
    expect(heard).toEqual([])
  })

  it('refuses what is not JSON, and anything but POST /command', async () => {
    const { presence } = await setup()
    const garbage = await fetch(`${presence.endpoint}/command`, {
      method: 'POST',
      headers: { [TOKEN_HEADER]: presence.token },
      body: 'not json',
    })
    expect(garbage.status).toBe(400)

    const elsewhere = await fetch(`${presence.endpoint}/other`, {
      headers: { [TOKEN_HEADER]: presence.token },
    })
    expect(elsewhere.status).toBe(404)
  })
})
