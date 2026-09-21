import type { PackProgressPush, PianoBridge } from '@piano/ipc'
import { describe, expect, it } from 'vitest'

import { createPackDownload } from './pack-download'

/**
 * The download as the window follows it, with main faked: offered with its
 * size, followed as it runs, and the sound told to look again once the pack
 * is in place.
 */

function fakeMain(
  answer: { installed: boolean; reason: string } = { installed: true, reason: '' },
) {
  let progress: ((update: PackProgressPush) => void) | null = null
  let finish: () => void = () => {}
  let cancelled = 0
  const bridge: Pick<
    PianoBridge,
    'packSource' | 'downloadPack' | 'cancelPackDownload' | 'onPackProgress'
  > = {
    packSource: () =>
      Promise.resolve({ available: true, id: 'p', version: 1, bytes: 15_000_000, files: 210 }),
    downloadPack: () =>
      new Promise((resolve) => {
        finish = () => resolve(answer)
      }),
    cancelPackDownload: () => {
      cancelled += 1
      return Promise.resolve(null)
    },
    onPackProgress: (listener) => {
      progress = listener
      return () => {
        progress = null
      }
    },
  }
  return {
    bridge,
    push: (update: PackProgressPush) => progress?.(update),
    finish: () => finish(),
    cancelled: () => cancelled,
    listening: () => progress !== null,
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('downloading the recordings', () => {
  it('offers the pack with its size before anything is fetched', async () => {
    const main = fakeMain()
    const download = createPackDownload(main.bridge, () => {})
    download.check()
    await settle()
    expect(download.state).toEqual({ kind: 'offered', bytes: 15_000_000 })
  })

  it('follows the download, then tells the sound to move onto the pack', async () => {
    const main = fakeMain()
    let reloaded = 0
    const download = createPackDownload(main.bridge, () => (reloaded += 1))
    download.check()
    await settle()
    download.start()
    main.push({ phase: 'downloading', bytes: 5_000_000, total: 15_000_000 })
    expect(download.state).toEqual({ kind: 'downloading', bytes: 5_000_000, total: 15_000_000 })
    main.push({ phase: 'installing', bytes: 15_000_000, total: 15_000_000 })
    expect(download.state).toEqual({ kind: 'installing' })
    main.finish()
    await settle()
    expect(download.state).toEqual({ kind: 'installed' })
    expect(reloaded).toBe(1)
    expect(main.listening()).toBe(false)
  })

  it('says why it stopped and can be tried again', async () => {
    const main = fakeMain({ installed: false, reason: 'the server said 503' })
    const download = createPackDownload(main.bridge, () => {})
    download.check()
    await settle()
    download.start()
    download.cancel()
    expect(main.cancelled()).toBe(1)
    main.finish()
    await settle()
    expect(download.state).toEqual({
      kind: 'stopped',
      reason: 'the server said 503',
      bytes: 15_000_000,
    })
    download.start()
    expect(download.state.kind).toBe('downloading')
  })

  it('offers nothing where there is nothing to download from', async () => {
    const main = fakeMain()
    const download = createPackDownload(
      {
        ...main.bridge,
        packSource: () => Promise.resolve({ available: false, reason: 'no download location' }),
      },
      () => {},
    )
    download.check()
    await settle()
    expect(download.state).toEqual({ kind: 'unavailable', reason: 'no download location' })
  })
})
