import { VALID_FIXTURES } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { createLibrary, libraryId, safeName, SCORE_SUFFIX, type Files } from './library'

/**
 * The library with its filesystem handed to it, which is how a test can ask
 * the one question that matters: what did it write, and where.
 */

const root = '/library'

function memory(seed: Record<string, string> = {}): Files & { readonly held: Map<string, string> } {
  const held = new Map(Object.entries(seed))
  return {
    held,
    read: (path) => {
      const text = held.get(path)
      return text === undefined
        ? Promise.reject(new Error(`no such file: ${path}`))
        : Promise.resolve(text)
    },
    write: (path, text) => {
      held.set(path, text)
      return Promise.resolve()
    },
    list: (dir) =>
      Promise.resolve(
        [...held.keys()]
          .filter((path) => path.startsWith(`${dir}/`))
          .map((path) => path.slice(dir.length + 1)),
      ),
    ensure: () => Promise.resolve(),
  }
}

const minimal = VALID_FIXTURES.minimal as unknown
const named = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  ...(minimal as Record<string, unknown>),
  metadata: { id, title, ...over },
})

describe('what an id is allowed to be', () => {
  it('cannot climb out of the library, whatever it is called', () => {
    expect(safeName('../../etc/passwd')).toBe('etc-passwd')
    expect(safeName('C:\\Windows\\system32')).toBe('c-windows-system32')
    expect(safeName('....')).toBe('score')
    expect(safeName('')).toBe('score')
  })

  it('keeps a readable name for an ordinary title', () => {
    expect(safeName('Prelude in C')).toBe('prelude-in-c')
  })

  it('is the score’s own id where it has one, and its title otherwise', () => {
    expect(libraryId(named('bwv-846', 'Prelude') as never)).toBe('bwv-846')
    expect(libraryId({ formatVersion: 1, metadata: { title: 'Prelude in C' } })).toBe(
      'prelude-in-c',
    )
  })
})

describe('keeping a score', () => {
  it('validates before it writes, so the library never holds a file the app refuses', async () => {
    const files = memory()
    const library = createLibrary(root, files)
    await expect(library.save({ formatVersion: 1, metadata: {} })).rejects.toThrow()
    expect(files.held.size).toBe(0)
  })

  it('writes one file, under the library and nowhere else', async () => {
    const files = memory()
    const library = createLibrary(root, files)
    const saved = await library.save(named('../escape', 'Prelude'))

    expect(saved.id).toBe('escape')
    expect([...files.held.keys()]).toEqual([`${root}/escape${SCORE_SUFFIX}`])
  })

  it('reads back exactly what it kept', async () => {
    const files = memory()
    const library = createLibrary(root, files)
    await library.save(named('bwv-846', 'Prelude'))
    const back = await library.read('bwv-846')
    expect(back.metadata.title).toBe('Prelude')
  })

  it('says so rather than throwing something unreadable for an id nobody saved', async () => {
    const library = createLibrary(root, memory())
    await expect(library.read('nothing')).rejects.toThrow()
  })
})

describe('listing what is there', () => {
  async function stocked() {
    const library = createLibrary(root, memory())
    await library.save(named('hard', 'Hard piece', { level: 'advanced', composer: 'Liszt' }))
    await library.save(named('easy', 'Easy piece', { level: 'beginner', composer: 'Czerny' }))
    return library
  }

  it('puts the easiest first, which is where somebody starting looks', async () => {
    const library = await stocked()
    expect((await library.list()).map((entry) => entry.id)).toEqual(['easy', 'hard'])
  })

  it('finds a piece by words from its title or its composer', async () => {
    const library = await stocked()
    expect((await library.search({ text: 'liszt' })).map((one) => one.id)).toEqual(['hard'])
    expect((await library.search({ level: 'beginner' })).map((one) => one.id)).toEqual(['easy'])
    expect(await library.search({ text: 'nothing like it' })).toEqual([])
  })

  it('lists nothing at all rather than failing where no library has been made', async () => {
    const empty = createLibrary('/nowhere', {
      read: () => Promise.reject(new Error('no')),
      write: () => Promise.resolve(),
      list: () => Promise.reject(new Error('no such directory')),
      ensure: () => Promise.resolve(),
    })
    expect(await empty.list()).toEqual([])
  })

  it('skips one unreadable file rather than refusing to list the rest', async () => {
    const files = memory({ [`${root}/broken${SCORE_SUFFIX}`]: 'not json' })
    const library = createLibrary(root, files)
    await library.save(named('fine', 'Fine piece'))
    expect((await library.list()).map((one) => one.id)).toEqual(['fine'])
  })
})
