import { createLibrary, memoryFiles } from '@piano/library'
import { parseScore, type Score } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { fileInLibrary } from './library-save'

/**
 * Filing the open score in the library, with the disk in a map: what is
 * written, under which id, what a score the format refuses is told, and what
 * happens when the id is already somebody else's.
 */

const aria: Score = {
  formatVersion: 1,
  metadata: { title: 'Aria in C', composer: 'Somebody' },
  notes: [{ pitch: 72, start: 0, duration: 480, velocity: 80 }],
}

/** A different piece that reduces to the same id, which is the whole problem. */
const other: Score = {
  formatVersion: 1,
  metadata: { title: 'ARIA IN C', composer: 'Somebody else' },
  notes: [{ pitch: 60, start: 0, duration: 960, velocity: 64 }],
}

function library(seed: Readonly<Record<string, string>> = {}) {
  const files = memoryFiles(seed)
  return { files, library: createLibrary('/library', files) }
}

/** The library with one piece already in it, filed the ordinary way. */
async function withAria() {
  const held = library()
  await fileInLibrary({ score: aria }, held.library)
  return held
}

describe('filing the open score in the library', () => {
  it('writes it under the id its metadata gives it, and says which', async () => {
    const { files, library: held } = library()
    const result = await fileInLibrary({ score: aria }, held)

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
    expect(await fileInLibrary({ score: crossed }, held)).toMatchObject({ kind: 'filed' })
  })

  it('refuses something that is not a score, naming what is wrong with it', async () => {
    const { files, library: held } = library()
    const result = await fileInLibrary({ score: { formatVersion: 1, metadata: {} } }, held)

    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') {
      expect(result.message).toContain('not a score the library can hold')
    }
    expect(files.held.size).toBe(0)
  })

  it('says the library could not be written rather than failing the call', async () => {
    const refusing = {
      save: () => Promise.reject(new Error('the disk is full')),
      held: () => Promise.resolve(null),
      free: (id: string) => Promise.resolve(id),
    }
    expect(await fileInLibrary({ score: aria }, refusing)).toEqual({
      kind: 'refused',
      message: 'the library could not be written: the disk is full',
    })
  })

  it('is listed once it is filed, which is what the panel shows', async () => {
    const { library: held } = library()
    await fileInLibrary({ score: aria }, held)
    expect((await held.list()).map((entry) => entry.metadata.title)).toEqual(['Aria in C'])
  })
})

describe('an id the library already holds', () => {
  it('describes what is there and writes nothing', async () => {
    const { files, library: held } = await withAria()
    const before = files.held.get('/library/aria-in-c.piano')

    const result = await fileInLibrary({ score: other }, held)

    expect(result).toEqual({
      kind: 'taken',
      id: 'aria-in-c',
      // Half a second: one quarter note at the tempo a score with no timing has.
      held: { title: 'Aria in C', composer: 'Somebody', seconds: 0.5 },
    })
    expect(files.held.get('/library/aria-in-c.piano')).toBe(before)
  })

  it('files the new piece beside it under a free id, and says the id it took', async () => {
    const { files, library: held } = await withAria()

    const result = await fileInLibrary({ score: other, taken: 'beside' }, held)

    expect(result).toEqual({ kind: 'filed', id: 'aria-in-c-2', title: 'ARIA IN C' })
    // Both pieces survive, and the new file carries the id it was filed under
    // rather than the one it asked for: the file and the score agree from now
    // on, so a later save from Claude Code cannot overwrite the wrong piece.
    expect(files.held.has('/library/aria-in-c.piano')).toBe(true)
    const written = parseScore(JSON.parse(files.held.get('/library/aria-in-c-2.piano') ?? ''))
    expect(written.ok).toBe(true)
    if (written.ok) {
      expect(written.score.metadata.id).toBe('aria-in-c-2')
      expect(written.score.metadata.title).toBe('ARIA IN C')
    }
  })

  it('numbers on past a second piece already filed beside', async () => {
    const { library: held } = await withAria()
    await fileInLibrary({ score: other, taken: 'beside' }, held)

    const third = await fileInLibrary({ score: other, taken: 'beside' }, held)
    expect(third).toMatchObject({ kind: 'filed', id: 'aria-in-c-3' })
  })

  it('replaces the piece that is there when that is what was asked for', async () => {
    const { files, library: held } = await withAria()

    const result = await fileInLibrary({ score: other, taken: 'replace' }, held)

    expect(result).toEqual({ kind: 'filed', id: 'aria-in-c', title: 'ARIA IN C' })
    expect(files.held.has('/library/aria-in-c-2.piano')).toBe(false)
    const written = parseScore(JSON.parse(files.held.get('/library/aria-in-c.piano') ?? ''))
    expect(written.ok && written.score.metadata.title).toBe('ARIA IN C')
  })

  it('asks nothing where the id is free, whatever was chosen last time', async () => {
    const { library: held } = library()
    expect(await fileInLibrary({ score: aria, taken: 'beside' }, held)).toMatchObject({
      kind: 'filed',
      id: 'aria-in-c',
    })
  })
})
