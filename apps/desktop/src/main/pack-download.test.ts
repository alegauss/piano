import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { PackProgressPush } from '@piano/ipc'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createPackDownloader, packSourceUrl, PUBLISHED_PACK } from './pack-download'

/**
 * The download against a real HTTP server on loopback, one that honours
 * ranges and can be told to cut a file short or send the wrong bytes. The
 * claims are the ones a download is judged by: it resumes, it verifies, and
 * the app never sees half a pack.
 */

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

type Pack = { readonly files: Map<string, Buffer>; readonly manifest: string }

function makePack(): Pack {
  const low = randomBytes(300_000)
  const high = randomBytes(200_000)
  const licence = Buffer.from('Creative Commons Attribution 3.0\n')
  const sample = (file: string, bytes: Buffer, lowKey: number, highKey: number) => ({
    file,
    pitch: lowKey,
    lowKey,
    highKey,
    lowVelocity: 1,
    highVelocity: 127,
    seconds: 1,
    bytes: bytes.length,
    sha256: sha(bytes),
  })
  const manifest = JSON.stringify({
    format: 1,
    id: 'test-piano',
    version: 1,
    sampleRate: 48000,
    channels: 2,
    credit: {
      title: 'Test Piano',
      author: 'Nobody',
      licence: 'CC-BY-3.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
      source: 'https://example.com/test-piano',
      licenceFile: 'LICENSE.txt',
    },
    samples: [sample('samples/low.ogg', low, 21, 64), sample('samples/high.ogg', high, 65, 108)],
  })
  return {
    manifest,
    files: new Map([
      ['manifest.json', Buffer.from(manifest)],
      ['samples/low.ogg', low],
      ['samples/high.ogg', high],
      ['LICENSE.txt', licence],
    ]),
  }
}

type Served = {
  readonly base: string
  readonly asked: { path: string; range: string | null }[]
  /** Cut this file off after so many bytes, the next time it is asked for. */
  cut: { path: string; after: number } | null
  /** Send these bytes instead of the file's own. */
  swap: Map<string, Buffer>
  /** Hold a file's body until released, so a test can act mid-download. */
  hold: { path: string; release: Promise<void> } | null
  close: () => Promise<void>
}

async function serve(pack: Pack): Promise<Served> {
  const served: Omit<Served, 'base' | 'close'> = {
    asked: [],
    cut: null,
    swap: new Map(),
    hold: null,
  }
  const server: Server = createServer((request, response) => {
    void (async () => {
      const path = decodeURIComponent((request.url ?? '/').slice(1))
      const range = request.headers.range ?? null
      served.asked.push({ path, range })
      const body = served.swap.get(path) ?? pack.files.get(path)
      if (body === undefined) {
        response.writeHead(404).end()
        return
      }
      const from = range === null ? 0 : Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0)
      const part = body.subarray(from)
      response.writeHead(range === null ? 200 : 206, { 'content-length': String(part.length) })
      if (served.hold?.path === path) {
        response.write(part.subarray(0, 1000))
        await served.hold.release
      }
      if (served.cut?.path === path) {
        const { after } = served.cut
        served.cut = null
        response.write(part.subarray(0, after))
        // Mid-file, as a dropped connection would.
        setTimeout(() => response.destroy(), 20)
        return
      }
      response.end(served.hold?.path === path ? part.subarray(1000) : part)
    })()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return Object.assign(served, {
    base: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  })
}

let directory = ''
let pack: Pack
let server: Served

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'piano-pack-'))
  pack = makePack()
  server = await serve(pack)
})

afterEach(async () => {
  await server.close()
  await rm(directory, { recursive: true, force: true })
})

const installedIn = () => join(directory, 'sample-pack')

describe('before anything is fetched', () => {
  it('says how big the pack is', async () => {
    const downloader = createPackDownloader({ base: server.base, directory: installedIn() })
    expect(await downloader.source()).toEqual({
      available: true,
      id: 'test-piano',
      version: 1,
      bytes: 500_000,
      files: 3,
    })
  })

  it('offers nothing where no download location is set', async () => {
    expect(PUBLISHED_PACK).toBeNull()
    expect(packSourceUrl({})).toBeNull()
    expect(packSourceUrl({ PIANO_PACK_URL: 'https://example.com/pack/' })).toBe(
      'https://example.com/pack/',
    )
    const downloader = createPackDownloader({ base: null, directory: installedIn() })
    expect(await downloader.source()).toMatchObject({ available: false })
  })

  it('refuses a manifest naming a file outside the pack, and writes nothing', async () => {
    const hostile = JSON.parse(pack.manifest) as { samples: { file: string }[] }
    const first = hostile.samples[0]
    if (first !== undefined) {
      first.file = '../../outside.ogg'
    }
    server.swap.set('manifest.json', Buffer.from(JSON.stringify(hostile)))
    const downloader = createPackDownloader({ base: server.base, directory: installedIn() })
    const answer = await downloader.download(() => {})
    expect(answer.installed).toBe(false)
    expect(answer.reason).toMatch(/cannot be inside it|cannot be used/)
    expect(await readdir(directory)).toEqual([])
  })
})

describe('the download', () => {
  it('fetches every file, verifies it, and puts the pack where the app looks', async () => {
    const updates: PackProgressPush[] = []
    const downloader = createPackDownloader({ base: server.base, directory: installedIn() })
    expect(await downloader.download((update) => updates.push(update))).toEqual({
      installed: true,
      reason: '',
    })
    expect(await readFile(join(installedIn(), 'samples', 'low.ogg'))).toEqual(
      pack.files.get('samples/low.ogg'),
    )
    expect(await readFile(join(installedIn(), 'manifest.json'), 'utf8')).toBe(pack.manifest)
    expect(updates.at(-1)).toEqual({ phase: 'installing', bytes: 500_000, total: 500_000 })
    // Nothing is left beside it.
    expect((await readdir(directory)).sort()).toEqual(['sample-pack'])
  })

  it('resumes a file cut short from where it stopped, and verifies the whole', async () => {
    server.cut = { path: 'samples/low.ogg', after: 120_000 }
    const downloader = createPackDownloader({ base: server.base, directory: installedIn() })
    const first = await downloader.download(() => {})
    expect(first).toEqual({
      installed: false,
      reason: 'the connection was lost; what arrived is kept for next time',
    })
    // Nothing half-made where the app looks.
    expect(await readdir(directory)).toEqual(['sample-pack.partial'])

    server.asked.length = 0
    const second = await downloader.download(() => {})
    expect(second.installed).toBe(true)
    const resumed = server.asked.find((one) => one.path === 'samples/low.ogg')
    expect(resumed?.range).toMatch(/^bytes=\d+-$/)
    expect(Number(/bytes=(\d+)-/.exec(resumed?.range ?? '')?.[1])).toBeGreaterThan(0)
    // A file that had already arrived whole is not fetched again.
    expect(server.asked.some((one) => one.path === 'samples/high.ogg')).toBe(false)
    expect(sha(await readFile(join(installedIn(), 'samples', 'low.ogg')))).toBe(
      sha(pack.files.get('samples/low.ogg') ?? Buffer.alloc(0)),
    )
  })

  it('throws away a file that does not match its checksum, and installs nothing', async () => {
    server.swap.set('samples/high.ogg', randomBytes(200_000))
    const downloader = createPackDownloader({ base: server.base, directory: installedIn() })
    const answer = await downloader.download(() => {})
    expect(answer.installed).toBe(false)
    expect(answer.reason).toContain('did not match its checksum')
    expect(await readdir(directory)).toEqual(['sample-pack.partial'])
    const kept = await readdir(join(directory, 'sample-pack.partial', 'samples'))
    expect(kept).not.toContain('high.ogg')
  })

  it('stops when asked, keeping what arrived, and carries on next time', async () => {
    let release: () => void = () => {}
    server.hold = { path: 'samples/low.ogg', release: new Promise((done) => (release = done)) }
    const downloader = createPackDownloader({ base: server.base, directory: installedIn() })
    const running = downloader.download(() => {})
    while (!server.asked.some((one) => one.path === 'samples/low.ogg')) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
    downloader.cancel()
    const answer = await running
    expect(answer).toEqual({
      installed: false,
      reason: 'cancelled; what arrived is kept for next time',
    })
    release()
    server.hold = null

    expect((await downloader.download(() => {})).installed).toBe(true)
  })

  it('replaces an older pack whole, or leaves it where it was', async () => {
    await mkdir(installedIn(), { recursive: true })
    await writeFile(join(installedIn(), 'manifest.json'), '{"old":true}')
    const downloader = createPackDownloader({ base: server.base, directory: installedIn() })
    expect((await downloader.download(() => {})).installed).toBe(true)
    expect(await readFile(join(installedIn(), 'manifest.json'), 'utf8')).toBe(pack.manifest)
  })
})
