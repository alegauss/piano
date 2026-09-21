import type { PianoBridge } from '@piano/ipc'
import type { Credit } from '@piano/sample-pack'
import { describe, expect, it, vi } from 'vitest'

import type { PackBank, PackProgress, PackSource } from '../audio'
import { bridgePackSource, createSound, type SoundState } from './sound'

const credit: Credit = {
  title: 'Salamander Grand Piano V3',
  author: 'Alexander Holm',
  licence: 'CC-BY-3.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
  source: 'https://example.com/salamander',
  licenceFile: 'LICENSE.txt',
}

function bridge(overrides: Partial<PianoBridge> = {}): PianoBridge {
  return {
    appInfo: () => Promise.reject(new Error('not used')),
    setWindowTitle: () => Promise.reject(new Error('not used')),
    packManifest: () => Promise.resolve({ installed: true, manifest: { any: 'manifest' } }),
    packFile: () => Promise.resolve({ bytes: new Uint8Array([1, 2, 3]) }),
    onLinkCommand: () => () => {},
    answerLinkCommand: () => Promise.resolve(null),
    openScore: () => Promise.resolve({ kind: 'none' }),
    openDroppedFile: () => Promise.resolve({ kind: 'none' }),
    recentScores: () => Promise.resolve([]),
    onScoreOpened: () => () => {},
    libraryScores: () => Promise.resolve([]),
    onLibraryChanged: () => () => {},
    ...overrides,
  }
}

/** A bank that reports progress when the test says so. */
function bank() {
  let progress: PackProgress = { loaded: 0, total: 30, decodedBytes: 0 }
  const listeners = new Set<(progress: PackProgress) => void>()
  const fake = {
    credit,
    get progress() {
      return progress
    },
    onProgress: (listener: (progress: PackProgress) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    advance: (loaded: number) => {
      progress = { ...progress, loaded }
      for (const listener of listeners) {
        listener(progress)
      }
    },
  }
  return fake
}

/** Every state the store passed through, in order. */
function watch(sound: ReturnType<typeof createSound>): SoundState[] {
  const seen: SoundState[] = []
  sound.subscribe(() => seen.push(sound.state))
  return seen
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('createSound', () => {
  it('stays synthesised, saying why, outside the app', async () => {
    const sound = createSound(null, () => ({ usePack: vi.fn() }))
    sound.start()
    await settle()
    expect(sound.state).toEqual({
      kind: 'synth',
      reason: 'this page is not running inside the app',
    })
  })

  it('stays synthesised, saying where it looked, when no pack is installed', async () => {
    const usePack = vi.fn()
    const sound = createSound(
      bridge({ packManifest: () => Promise.resolve({ installed: false, location: '/p/pack' }) }),
      () => ({ usePack }),
    )
    sound.start()
    await settle()
    expect(sound.state).toEqual({ kind: 'synth', reason: 'no sample pack is installed in /p/pack' })
    expect(usePack).not.toHaveBeenCalled()
  })

  it('moves onto the installed pack and reports its credit and progress', async () => {
    const loaded = bank()
    const usePack = vi.fn((_source: PackSource) => Promise.resolve(loaded as unknown as PackBank))
    const sound = createSound(bridge(), () => ({ usePack }))
    const seen = watch(sound)
    sound.start()
    await settle()
    loaded.advance(12)

    expect(seen).toEqual([
      { kind: 'sampled', credit, loaded: 0, total: 30 },
      { kind: 'sampled', credit, loaded: 12, total: 30 },
    ])
  })

  it('reports a broken pack as a line of text and keeps the synthesiser', async () => {
    const sound = createSound(bridge(), () => ({
      usePack: () => Promise.reject(new Error('the manifest cannot be used')),
    }))
    sound.start()
    await settle()
    expect(sound.state).toEqual({ kind: 'failed', message: 'the manifest cannot be used' })
  })

  it('starts once, however many times it is asked', async () => {
    const usePack = vi.fn(() => Promise.resolve(bank() as unknown as PackBank))
    const sound = createSound(bridge(), () => ({ usePack }))
    sound.start()
    sound.start()
    await settle()
    expect(usePack).toHaveBeenCalledTimes(1)
  })
})

describe('bridgePackSource', () => {
  it('hands over the manifest it was given and fetches files by path', async () => {
    const packFile = vi.fn(() => Promise.resolve({ bytes: new Uint8Array([7, 8, 9]) }))
    const source = bridgePackSource(bridge({ packFile }), { id: 'pack' })
    expect(await source.manifest()).toEqual({ id: 'pack' })
    const file = await source.file('samples/C4-v8.ogg')
    expect(packFile).toHaveBeenCalledWith({ path: 'samples/C4-v8.ogg' })
    expect([...new Uint8Array(file)]).toEqual([7, 8, 9])
  })

  it('gives each file a buffer of its own, since decoding takes it over', async () => {
    const shared = new Uint8Array([0, 1, 2, 3, 4, 5]).subarray(2, 4)
    const source = bridgePackSource(
      bridge({ packFile: () => Promise.resolve({ bytes: shared }) }),
      {},
    )
    const file = await source.file('samples/C4-v8.ogg')
    expect(file.byteLength).toBe(2)
    expect(file).not.toBe(shared.buffer)
  })
})
