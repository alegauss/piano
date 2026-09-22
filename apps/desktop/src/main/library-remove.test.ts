import { resolve } from 'node:path'

import type { RecentEntry } from '@piano/ipc'
import { createLibrary, memoryFiles } from '@piano/library'
import type { Score } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { removeFromLibrary, type Recently, type Removing } from './library-remove'
import { samePath } from './recent'

/**
 * Taking a piece out of the library, with the disk in a map: that the file
 * goes to the bin rather than being unlinked, that the menu stops offering
 * it, and that an id nothing is filed under is a sentence rather than a
 * rejected promise.
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

/** The recent list, as a deletion touches it. */
function recently(held: readonly RecentEntry[] = []) {
  let entries = [...held]
  return {
    entries: () => entries,
    dropped: (path: string) => {
      entries = entries.filter((one) => !samePath(one.path, path))
      return Promise.resolve(entries)
    },
  }
}

const opened = (path: string, title: string): RecentEntry => ({
  path,
  name: path.split('/').at(-1) ?? path,
  title,
})

describe('taking a piece out of the library', () => {
  it('discards the file and says which id went', async () => {
    const { files, library } = await withAria()

    expect(await removeFromLibrary({ id: 'aria' }, library, recently())).toEqual({
      kind: 'removed',
      id: 'aria',
    })
    expect(files.discarded).toEqual(['/library/aria.piano'])
  })

  it('says so when nothing is filed under that id', async () => {
    const { files, library } = await withAria()

    expect(await removeFromLibrary({ id: 'gone' }, library, recently())).toEqual({
      kind: 'refused',
      message: 'nothing is filed as gone',
    })
    expect(files.discarded).toEqual([])
  })

  it('answers a bin that refused rather than rejecting, so the window can say why', async () => {
    const broken: Removing = {
      held: () => Promise.resolve(null),
      remove: () => Promise.reject(new Error('the bin is full')),
    }

    expect(await removeFromLibrary({ id: 'aria' }, broken, recently())).toEqual({
      kind: 'refused',
      message: 'it could not be taken out of the library: the bin is full',
    })
  })
})

describe('the menu’s copy of what was opened lately', () => {
  it('stops offering a piece that has gone to the bin', async () => {
    const { library } = await withAria()
    const list = recently([opened(resolve('/library/aria.piano'), 'Aria')])

    await removeFromLibrary({ id: 'aria' }, library, list)

    expect(list.entries()).toEqual([])
  })

  it('leaves an entry naming some other piece exactly as it was', async () => {
    const { library } = await withAria()
    const other = opened(resolve('/library/something-else.piano'), 'Something else')
    const list = recently([other])

    await removeFromLibrary({ id: 'aria' }, library, list)

    expect(list.entries()).toEqual([other])
  })

  it('is left alone where nothing was deleted', async () => {
    const { library } = await withAria()
    const entry = opened(resolve('/library/aria.piano'), 'Aria')
    const list: Recently & { readonly entries: () => readonly RecentEntry[] } = recently([entry])

    await removeFromLibrary({ id: 'never-filed' }, library, list)

    expect(list.entries()).toEqual([entry])
  })
})
