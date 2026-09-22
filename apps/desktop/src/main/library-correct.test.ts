import { createLibrary, memoryFiles } from '@piano/library'
import { parseScore, type Score } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { correctInLibrary, type Correcting } from './library-correct'

/**
 * Correcting a filed piece, with the disk in a map: what is written, what a
 * window is told about a piece that is no longer there, and that a refusal is
 * a sentence rather than a rejected promise.
 */

const aria: Score = {
  formatVersion: 1,
  metadata: { id: 'aria', title: 'Track 1', composer: 'Track 1', tags: ['midi'] },
  notes: [{ pitch: 72, start: 0, duration: 480, velocity: 80 }],
}

async function withAria() {
  const files = memoryFiles()
  const library = createLibrary('/library', files)
  await library.save(aria)
  return { files, library }
}

describe('correcting what a filed piece says about itself', () => {
  it('writes the corrected fields back and answers with the score as kept', async () => {
    const { files, library } = await withAria()

    const result = await correctInLibrary(
      { id: 'aria', metadata: { title: 'Aria in C', composer: 'Bach', difficulty: 3 } },
      library,
    )

    expect(result).toMatchObject({ kind: 'corrected', id: 'aria', title: 'Aria in C' })
    const written = parseScore(JSON.parse(files.held.get('/library/aria.piano') ?? ''))
    expect(written.ok && written.score.metadata).toMatchObject({
      title: 'Aria in C',
      composer: 'Bach',
      difficulty: 3,
    })
    // What is taken back is taken back: a tag the import invented is gone.
    expect(written.ok && written.score.metadata.tags).toBeUndefined()
  })

  it('leaves the notes alone, since a correction is about what a piece says about itself', async () => {
    const { library } = await withAria()
    const result = await correctInLibrary({ id: 'aria', metadata: { title: 'Aria in C' } }, library)
    expect(result.kind === 'corrected' && (result.score as Score).notes).toEqual(aria.notes)
  })

  it('says so when nothing is filed under that id any more', async () => {
    const { library } = await withAria()
    const result = await correctInLibrary({ id: 'gone', metadata: { title: 'Gone' } }, library)
    expect(result).toEqual({ kind: 'refused', message: 'nothing is filed as gone any more' })
  })

  it('answers a write that failed rather than rejecting, so the window can say why', async () => {
    const broken: Correcting = { correct: () => Promise.reject(new Error('the disk is full')) }

    const result = await correctInLibrary({ id: 'aria', metadata: { title: 'Aria' } }, broken)

    expect(result).toEqual({
      kind: 'refused',
      message: 'the library could not be written: the disk is full',
    })
  })
})
