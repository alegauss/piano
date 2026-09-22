import { resolve } from 'node:path'

import type { RecentEntry } from '@piano/ipc'
import { createLibrary, memoryFiles } from '@piano/library'
import { parseScore, type Score } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { correctInLibrary, type Correcting, type OpenScore } from './library-correct'
import { samePath } from './recent'

/**
 * Correcting a filed piece, with the disk in a map. Where the piece ends up is
 * the library's question and settled in its own suite; what is settled here is
 * what crosses the bridge, and what a window showing the piece is told.
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

/** The recent list, as a correction touches it: what it held, and what it was told. */
function recently(held: readonly RecentEntry[] = []) {
  let entries = [...held]
  return {
    entries: () => entries,
    corrected: (was: string, now: RecentEntry) => {
      entries = entries.map((one) => (samePath(one.path, was) ? now : one))
      return Promise.resolve(entries)
    },
  }
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
      recently(),
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
      recently(),
    )
    expect(result.kind === 'corrected' && (result.score as Score).notes).toEqual(aria.notes)
  })

  it('says so when nothing is filed under that id any more', async () => {
    const { library } = await withAria()
    const result = await correctInLibrary(
      { id: 'gone', metadata: { title: 'Gone' } },
      library,
      closed(),
      recently(),
    )
    expect(result).toEqual({ kind: 'refused', message: 'nothing is filed as gone any more' })
  })

  it('carries the library’s question across as the one the filing form asks', async () => {
    const { library } = await withAria()
    await library.save({
      formatVersion: 1,
      metadata: { title: 'Prelude in C', composer: 'Bach', durationSeconds: 95 },
      notes: [{ pitch: 60, start: 0, duration: 960, velocity: 64 }],
    })

    const result = await correctInLibrary(
      { id: 'track-1', metadata: { title: 'Prelude in C' } },
      library,
      closed(),
      recently(),
    )

    expect(result).toEqual({
      kind: 'taken',
      id: 'prelude-in-c',
      held: { title: 'Prelude in C', composer: 'Bach', seconds: 95 },
    })
  })

  it('answers a write that failed rather than rejecting, so the window can say why', async () => {
    const broken: Correcting = {
      held: () => Promise.reject(new Error('the disk is full')),
      correct: () => Promise.reject(new Error('the disk is full')),
    }

    const result = await correctInLibrary(
      { id: 'aria', metadata: { title: 'Aria' } },
      broken,
      closed(),
      recently(),
    )

    expect(result).toEqual({
      kind: 'refused',
      message: 'the library could not be written: the disk is full',
    })
  })
})

describe('the file the window has open', () => {
  it('follows the piece when it moves, so a keep does not write to a gone name', async () => {
    const { library } = await withAria({ ...aria, metadata: { title: 'Track 1' } })
    const open = showing('/library/track-1.piano')

    const result = await correctInLibrary(
      { id: 'track-1', metadata: { title: 'Prelude in C' } },
      library,
      open,
      recently(),
    )

    expect(result).toMatchObject({ kind: 'corrected', id: 'prelude-in-c', open: true })
    expect(open.at()).toBe('/library/prelude-in-c.piano')
  })

  it('is left alone when the correction was about some other piece', async () => {
    const { library } = await withAria()
    const open = showing('/library/something-else.piano')

    const result = await correctInLibrary(
      { id: 'track-1', metadata: { title: 'Prelude in C' } },
      library,
      open,
      recently(),
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
      recently(),
    )

    expect(result).toMatchObject({ kind: 'corrected', open: true })
  })
})

describe('the recent list’s copy of what a piece is called', () => {
  /** The list as it would be after the piece was opened once. */
  const opened = (path: string, title: string): RecentEntry => ({
    path,
    name: path.split('/').at(-1) ?? path,
    title,
  })

  it('is put right after a correction, and follows the file when it moves', async () => {
    const { library } = await withAria({ ...aria, metadata: { title: 'Track 1' } })
    const list = recently([opened(resolve('/library/track-1.piano'), 'Track 1')])

    await correctInLibrary(
      { id: 'track-1', metadata: { title: 'Prelude in C' } },
      library,
      closed(),
      list,
    )

    expect(list.entries()).toEqual([
      {
        path: resolve('/library/prelude-in-c.piano'),
        name: `prelude-in-c.piano`,
        title: 'Prelude in C',
      },
    ])
  })

  it('leaves an entry naming some other piece exactly as it was', async () => {
    const { library } = await withAria()
    const other = opened(resolve('/library/something-else.piano'), 'Something else')
    const list = recently([other])

    await correctInLibrary(
      { id: 'track-1', metadata: { title: 'Prelude in C' } },
      library,
      closed(),
      list,
    )

    expect(list.entries()).toEqual([other])
  })
})
