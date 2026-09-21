import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { INDEX_FILE } from '@piano/library'
import { afterEach, describe, expect, it } from 'vitest'

import { watchLibrary } from './library-watch'

/**
 * The library folder on a real disk, watched. The claims: a score arriving is
 * news, a burst of writes is one piece of it, and the index being rewritten
 * by a listing is none.
 */

let directory = ''
let stop: (() => void) | null = null

afterEach(async () => {
  stop?.()
  stop = null
  await rm(directory, { recursive: true, force: true })
})

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('watching the library folder', () => {
  it('says so when a score arrives, once for a burst of writes', async () => {
    directory = await mkdtemp(join(tmpdir(), 'piano-watch-'))
    const root = join(directory, 'library')
    let told = 0
    stop = await watchLibrary(root, () => (told += 1), 100)

    await writeFile(join(root, 'aria.score.json'), '{}')
    await writeFile(join(root, 'aria.score.json'), '{ }')
    await writeFile(join(root, 'bourree.score.json'), '{}')
    // However late the system delivers the events, they arrive as one piece of news.
    const until = Date.now() + 5000
    while (told === 0 && Date.now() < until) {
      await settle(50)
    }
    await settle(400)
    expect(told).toBe(1)
  })

  it('keeps quiet about the index a listing rewrites', async () => {
    directory = await mkdtemp(join(tmpdir(), 'piano-watch-'))
    const root = join(directory, 'library')
    let told = 0
    stop = await watchLibrary(root, () => (told += 1), 100)

    await writeFile(join(root, INDEX_FILE), '{}')
    await settle(600)
    expect(told).toBe(0)
  })
})
