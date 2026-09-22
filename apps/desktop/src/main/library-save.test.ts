import { createLibrary, memoryFiles } from '@piano/library'
import { parseScore, type Score } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { fileInLibrary } from './library-save'

/**
 * Filing the open score in the library, with the disk in a map: what is
 * written, under which id, and what a score the format refuses is told.
 */

const aria: Score = {
  formatVersion: 1,
  metadata: { title: 'Aria in C', composer: 'Somebody' },
  notes: [{ pitch: 72, start: 0, duration: 480, velocity: 80 }],
}

function library(seed: Readonly<Record<string, string>> = {}) {
  const files = memoryFiles(seed)
  return { files, library: createLibrary('/library', files) }
}

describe('filing the open score in the library', () => {
  it('writes it under the id its metadata gives it, and says which', async () => {
    const { files, library: held } = library()
    const result = await fileInLibrary(aria, held)

    expect(result).toEqual({ kind: 'filed', id: 'aria-in-c', title: 'Aria in C' })
    const written = files.held.get('/library/aria-in-c.piano')
    expect(written).toBeDefined()
    expect(parseScore(JSON.parse(written ?? '')).ok).toBe(true)
  })

  it('files a score whatever it arrives as, since the window is not trusted', async () => {
    // The renderer sends JSON, so what crosses is a plain object and never a
    // Score: the parse here is what makes it one.
    const { library: held } = library()
    const crossed: unknown = JSON.parse(JSON.stringify(aria))
    expect(await fileInLibrary(crossed, held)).toMatchObject({ kind: 'filed' })
  })

  it('refuses something that is not a score, naming what is wrong with it', async () => {
    const { files, library: held } = library()
    const result = await fileInLibrary({ formatVersion: 1, metadata: {} }, held)

    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') {
      expect(result.message).toContain('not a score the library can hold')
    }
    expect(files.held.size).toBe(0)
  })

  it('says the library could not be written rather than failing the call', async () => {
    const refusing = {
      save: () => Promise.reject(new Error('the disk is full')),
    }
    expect(await fileInLibrary(aria, refusing)).toEqual({
      kind: 'refused',
      message: 'the library could not be written: the disk is full',
    })
  })

  it('is listed once it is filed, which is what the panel shows', async () => {
    const { library: held } = library()
    await fileInLibrary(aria, held)
    expect((await held.list()).map((entry) => entry.metadata.title)).toEqual(['Aria in C'])
  })
})
