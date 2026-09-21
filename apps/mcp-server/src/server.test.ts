import { VALID_FIXTURES } from '@piano/score-format'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'

import { createLibrary, type Files } from './library'
import { createServer } from './server'

/**
 * The server over the real protocol, with the two ends joined in memory.
 *
 * The tool table is tested next door; what this asks is whether a caller that
 * speaks MCP can find the tools at all and get an answer back, which is the
 * one thing a table of functions cannot prove about itself.
 */

function memory(): Files {
  const held = new Map<string, string>()
  return {
    read: (path) => {
      const text = held.get(path)
      return text === undefined ? Promise.reject(new Error('no')) : Promise.resolve(text)
    },
    write: (path, text) => {
      held.set(path, text)
      return Promise.resolve()
    },
    list: (dir) =>
      Promise.resolve(
        [...held.keys()]
          .filter((path) => path.startsWith(`${dir}/`))
          .map((path) => path.slice(dir.length + 1)),
      ),
    ensure: () => Promise.resolve(),
  }
}

async function connected() {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const server = createServer({ library: createLibrary('/library', memory()) })
  const client = new Client({ name: 'test', version: '0.0.0' })
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  return { client, close: () => Promise.all([client.close(), server.close()]) }
}

describe('a caller that speaks the protocol', () => {
  it('finds every tool, with something to read about each', async () => {
    const { client, close } = await connected()
    const listed = await client.listTools()

    expect(listed.tools.map((one) => one.name)).toContain('practise')
    for (const one of listed.tools) {
      expect(one.description ?? '', one.name).not.toBe('')
    }
    await close()
  })

  it('gets an answer back from a tool it calls', async () => {
    const { client, close } = await connected()
    const answer = await client.callTool({
      name: 'validate_score',
      arguments: { score: VALID_FIXTURES.minimal },
    })

    expect(answer.isError).not.toBe(true)
    expect(JSON.stringify(answer.content)).toContain('Valid')
    await close()
  })

  it('is told what is wrong rather than being handed an exception', async () => {
    const { client, close } = await connected()
    const answer = await client.callTool({
      name: 'validate_score',
      arguments: { score: { formatVersion: 1, metadata: {} } },
    })

    expect(answer.isError).toBe(true)
    expect(JSON.stringify(answer.content)).toContain('title')
    await close()
  })
})
