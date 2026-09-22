import { createLibrary, memoryFiles } from '@piano/library'
import { parseScore, type Score } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { correctInLibrary, type Correcting, type OpenScore } from './library-correct'

/**
 * Correcting a filed piece, with the disk in a map: what is written, where it
 * ends up when the title moves it, what is asked when that name is taken, and
 * what a window showing the piece is told.
 */

const aria: Score = {
  formatVersion: 1,
  metadata: { title: 'Track 1', composer: 'Track 1', tags: ['midi'] },
  notes: [{ pitch: 72, start: 0, duration: 480, velocity: 80 }],
}

/** A window with nothing open, which is most of these tests. */
function closed(): OpenScore & { readonly at: () => string | null } {
  let path: string | null = null
  return {
    held: () => path,
    moved: (next) => {
      path = next
    },
    at: () => path,
  }
}

/** A window showing the piece at this path. */
function showing(path: string): OpenScore & { readonly at: () => string | null } {
  const open = closed()
  open.moved(path)
  return open
}

async function withAria(score: Score = aria) {
  const files = memoryFiles()
  const library = createLibrary('/library', files)
  const saved = await library.save(score)
  return { files, library, saved }
}

const written = (files: ReturnType<typeof memoryFiles>, name: string): Score | null => {
  const text = files.held.get(`/library/${name}`)
  if (text === undefined) {
    return null
  }
  const parsed = parseScore(JSON.parse(text))
  return parsed.ok ? parsed.score : null
}

describe('correcting what a filed piece says about itself', () => {
  it('writes the corrected fields back and answers with the score as kept', async () => {
    const { files, library } = await withAria()

    const result = await correctInLibrary(
      { id: 'track-1', metadata: { title: 'Track 1', composer: 'Bach', difficulty: 3 } },
      library,
      closed(),
    )

    expect(result).toMatchObject({ kind: 'corrected', id: 'track-1', title: 'Track 1' })
    expect(written(files, 'track-1.piano')?.metadata).toMatchObject({
      composer: 'Bach',
      difficulty: 3,
    })
    // What is taken back is taken back: a tag the import invented is gone.
    expect(written(files, 'track-1.piano')?.metadata.tags).toBeUndefined()
  })

  it('leaves the notes alone, since a correction is about what a piece says about itself', async () => {
    const { library } = await withAria()
    const result = await correctInLibrary(
      { id: 'track-1', metadata: { title: 'Track 1' } },
      library,
      closed(),
    )
    expect(result.kind === 'corrected' && (result.score as Score).notes).toEqual(aria.notes)
  })

  it('says so when nothing is filed under that id any more', async () => {
    const { library } = await withAria()
    const result = await correctInLibrary(
      { id: 'gone', metadata: { title: 'Gone' } },
      library,
      closed(),
    )
    expect(result).toEqual({ kind: 'refused', message: 'nothing is filed as gone any more' })
  })

  it('answers a write that failed rather than rejecting, so the window can say why', async () => {
    const broken: Correcting = {
      held: () => Promise.reject(new Error('the disk is full')),
      free: () => Promise.reject(new Error('the disk is full')),
      correct: () => Promise.reject(new Error('the disk is full')),
    }

    const result = await correctInLibrary(
      { id: 'aria', metadata: { title: 'Aria' } },
      broken,
      closed(),
    )

    expect(result).toEqual({
      kind: 'refused',
      message: 'the library could not be written: the disk is full',
    })
  })
})

describe('a piece that is retitled', () => {
  it('moves to the name its new title gives it, and the old file goes', async () => {
    const { files, library } = await withAria()

    const result = await correctInLibrary(
      { id: 'track-1', metadata: { title: 'Prelude in C' } },
      library,
      closed(),
    )

    expect(result).toMatchObject({ kind: 'corrected', id: 'prelude-in-c' })
    expect(written(files, 'prelude-in-c.piano')?.metadata.title).toBe('Prelude in C')
    expect(files.held.has('/library/track-1.piano')).toBe(false)
  })

  it('stays where it is when the score carries an id of its own', async () => {
    // The id is the stable handle records are kept against; a title is not.
    const { files, library } = await withAria({
      ...aria,
      metadata: { ...aria.metadata, id: 'bwv-846' },
    })

    const result = await correctInLibrary(
      { id: 'bwv-846', metadata: { title: 'Prelude in C' } },
      library,
      closed(),
    )

    expect(result).toMatchObject({ kind: 'corrected', id: 'bwv-846' })
    expect(written(files, 'bwv-846.piano')?.metadata.title).toBe('Prelude in C')
    expect(files.held.has('/library/prelude-in-c.piano')).toBe(false)
  })

  it('asks before taking a name something else holds, and writes nothing', async () => {
    const { files, library } = await withAria()
    await library.save({
      formatVersion: 1,
      metadata: { title: 'Prelude in C', composer: 'Bach', durationSeconds: 95 },
      notes: [{ pitch: 60, start: 0, duration: 960, velocity: 64 }],
    })

    const result = await correctInLibrary(
      { id: 'track-1', metadata: { title: 'Prelude in C' } },
      library,
      closed(),
    )

    expect(result).toEqual({
      kind: 'taken',
      id: 'prelude-in-c',
      held: { title: 'Prelude in C', composer: 'Bach', seconds: 95 },
    })
    expect(written(files, 'prelude-in-c.piano')?.metadata.composer).toBe('Bach')
    expect(files.held.has('/library/track-1.piano')).toBe(true)
  })

  it('files it beside the other, under an id it then carries as its own', async () => {
    const { files, library } = await withAria()
    await library.save({ ...aria, metadata: { title: 'Prelude in C' } })

    const result = await correctInLibrary(
      { id: 'track-1', metadata: { title: 'Prelude in C' }, taken: 'beside' },
      library,
      closed(),
    )

    expect(result).toMatchObject({ kind: 'corrected', id: 'prelude-in-c-2' })
    // Written into the score, so file and metadata agree and nothing moves it
    // again the next time anybody touches it.
    expect(written(files, 'prelude-in-c-2.piano')?.metadata.id).toBe('prelude-in-c-2')
    expect(files.held.has('/library/track-1.piano')).toBe(false)
  })

  it('replaces what is there when that is what was asked for', async () => {
    const { files, library } = await withAria()
    await library.save({ ...aria, metadata: { title: 'Prelude in C', composer: 'Somebody else' } })

    const result = await correctInLibrary(
      { id: 'track-1', metadata: { title: 'Prelude in C' }, taken: 'replace' },
      library,
      closed(),
    )

    expect(result).toMatchObject({ kind: 'corrected', id: 'prelude-in-c' })
    expect(written(files, 'prelude-in-c.piano')?.metadata.composer).toBeUndefined()
    expect(files.held.has('/library/track-1.piano')).toBe(false)
  })
})

describe('the file the window has open', () => {
  it('follows the piece when it moves, so a keep does not write to a gone name', async () => {
    const { library } = await withAria()
    const open = showing('/library/track-1.piano')

    const result = await correctInLibrary(
      { id: 'track-1', metadata: { title: 'Prelude in C' } },
      library,
      open,
    )

    expect(result).toMatchObject({ kind: 'corrected', open: true })
    expect(open.at()).toBe('/library/prelude-in-c.piano')
  })

  it('is left alone when the correction was about some other piece', async () => {
    const { library } = await withAria()
    const open = showing('/library/something-else.piano')

    const result = await correctInLibrary(
      { id: 'track-1', metadata: { title: 'Prelude in C' } },
      library,
      open,
    )

    expect(result).toMatchObject({ kind: 'corrected', open: false })
    expect(open.at()).toBe('/library/something-else.piano')
  })

  it('is recognised however the two paths were spelled', async () => {
    const { library } = await withAria()
    // What the opener holds is a joined path; what the library holds is built
    // with forward slashes, and on Windows those are two spellings of one file.
    const open = showing('/library/./track-1.piano')

    const result = await correctInLibrary(
      { id: 'track-1', metadata: { title: 'Track 1', composer: 'Bach' } },
      library,
      open,
    )

    expect(result).toMatchObject({ kind: 'corrected', open: true })
  })
})
