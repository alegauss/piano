import { createLibrary, memoryFiles } from '@piano/library'
import type { Score } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { removeFromLibrary, type Removing } from './library-remove'

/**
 * Taking a piece out of the library, with the disk in a map: that the file
 * goes to the bin rather than being unlinked, and that an id nothing is filed
 * under is a sentence rather than a rejected promise.
 */

const aria: Score = {
  formatVersion: 1,
  metadata: { id: 'aria', title: 'Aria' },
  notes: [{ pitch: 72, start: 0, duration: 480, velocity: 80 }],
}

async function withAria() {
  const files = memoryFiles()
  const library = createLibrary('/library', files)
  await library.save(aria)
  return { files, library }
}

describe('taking a piece out of the library', () => {
  it('discards the file and says which id went', async () => {
    const { files, library } = await withAria()

    expect(await removeFromLibrary({ id: 'aria' }, library)).toEqual({
      kind: 'removed',
      id: 'aria',
    })
    expect(files.discarded).toEqual(['/library/aria.piano'])
  })

  it('says so when nothing is filed under that id', async () => {
    const { files, library } = await withAria()

    expect(await removeFromLibrary({ id: 'gone' }, library)).toEqual({
      kind: 'refused',
      message: 'nothing is filed as gone',
    })
    expect(files.discarded).toEqual([])
  })

  it('answers a bin that refused rather than rejecting, so the window can say why', async () => {
    const broken: Removing = { remove: () => Promise.reject(new Error('the bin is full')) }

    expect(await removeFromLibrary({ id: 'aria' }, broken)).toEqual({
      kind: 'refused',
      message: 'it could not be taken out of the library: the bin is full',
    })
  })
})
