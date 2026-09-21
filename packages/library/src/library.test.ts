import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SCORE_SUFFIX, safeName } from '@piano/ipc'
import { VALID_FIXTURES } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { memoryFiles, nodeFiles } from './files'
import { createLibrary, durationOf, INDEX_FILE, libraryId } from './library'

/**
 * The library with its filesystem handed to it, which is how a test can ask
 * what it wrote, where, and what it read to answer a listing.
 */

const root = '/library'

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

  it('never takes a name Windows keeps for a device', () => {
    expect(safeName('CON')).toBe('con-score')
    expect(safeName('lpt1')).toBe('lpt1-score')
    expect(safeName('console')).toBe('console')
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
    const files = memoryFiles()
    const library = createLibrary(root, files)
    await expect(library.save({ formatVersion: 1, metadata: {} })).rejects.toThrow()
    expect(files.held.size).toBe(0)
  })

  it('writes one file, under the library and nowhere else', async () => {
    const files = memoryFiles()
    const library = createLibrary(root, files)
    const saved = await library.save(named('../escape', 'Prelude'))

    expect(saved.id).toBe('escape')
    expect([...files.held.keys()]).toEqual([`${root}/escape${SCORE_SUFFIX}`])
  })

  it('reads back exactly what it kept', async () => {
    const library = createLibrary(root, memoryFiles())
    await library.save(named('bwv-846', 'Prelude'))
    const back = await library.read('bwv-846')
    expect(back.metadata.title).toBe('Prelude')
  })

  it('says so rather than throwing something unreadable for an id nobody saved', async () => {
    const library = createLibrary(root, memoryFiles())
    await expect(library.read('nothing')).rejects.toThrow()
  })
})

describe('on a real disk, against names chosen to escape', () => {
  it('writes every score inside the library and nothing anywhere else', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'piano-escape-'))
    const library = createLibrary(join(parent, 'library'), nodeFiles)
    try {
      const hostile = [
        '../../outside',
        '/etc/passwd',
        'C:\\Windows\\win.ini',
        '\\\\server\\share\\x',
        '..',
        'a/../../b',
        'con',
        'NUL',
        'com1',
        '\u2025\u2025/x',
        'name\u0000.exe',
        'x'.repeat(500),
      ]
      for (const id of hostile) {
        await library.save(named(id, 'Hostile'))
      }

      // Only the library was created beside the files this test made.
      expect(await readdir(parent)).toEqual(['library'])
      const written = await readdir(library.root)
      expect(written.length).toBeGreaterThan(0)
      for (const name of written) {
        expect(name).toMatch(/^[a-z0-9-]+\.score\.json$/)
        expect(name).not.toMatch(/^(con|prn|aux|nul|com\d|lpt\d)\./)
      }
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })
})

describe('listing what is there', () => {
  async function stocked() {
    const files = memoryFiles()
    const library = createLibrary(root, files)
    await library.save(named('hard', 'Hard piece', { level: 'advanced', composer: 'Liszt' }))
    await library.save(named('easy', 'Easy piece', { level: 'beginner', composer: 'Czerny' }))
    return { library, files }
  }

  it('puts the easiest first, which is where somebody starting looks', async () => {
    const { library } = await stocked()
    expect((await library.list()).map((entry) => entry.id)).toEqual(['easy', 'hard'])
  })

  it('puts the newest first when asked, which is where a piece just written is', async () => {
    const { library } = await stocked()
    expect((await library.list('newest')).map((entry) => entry.id)).toEqual(['easy', 'hard'])
    await library.save(named('fresh', 'Fresh piece', { level: 'advanced' }))
    expect((await library.list('newest')).map((entry) => entry.id)[0]).toBe('fresh')
  })

  it('finds a piece by words from its title or its composer', async () => {
    const { library } = await stocked()
    expect((await library.search({ text: 'liszt' })).map((one) => one.id)).toEqual(['hard'])
    expect((await library.search({ level: 'beginner' })).map((one) => one.id)).toEqual(['easy'])
    expect(await library.search({ text: 'nothing like it' })).toEqual([])
  })

  it('lists nothing at all rather than failing where no library has been made', async () => {
    const empty = createLibrary('/nowhere', {
      ...memoryFiles(),
      list: () => Promise.reject(new Error('no such directory')),
    })
    expect(await empty.list()).toEqual([])
  })

  it('skips one unreadable file rather than refusing to list the rest', async () => {
    const files = memoryFiles({ [`${root}/broken${SCORE_SUFFIX}`]: 'not json' })
    const library = createLibrary(root, files)
    await library.save(named('fine', 'Fine piece'))
    expect((await library.list()).map((one) => one.id)).toEqual(['fine'])
  })

  it('says how long each piece lasts, working it out from the notes where it is not stated', () => {
    const score = {
      formatVersion: 1 as const,
      metadata: { title: 'Two beats' },
      notes: [{ pitch: 60, start: 480, duration: 480, velocity: 80 }],
    }
    // Two quarters at the default 120 a minute.
    expect(durationOf(score)).toBeCloseTo(1, 6)
    expect(durationOf({ ...score, metadata: { title: 'Stated', durationSeconds: 90 } })).toBe(90)
  })
})

describe('the index a listing is served from', () => {
  it('reads each score once, and again only when it changes', async () => {
    const files = memoryFiles()
    const library = createLibrary(root, files)
    await library.save(named('one', 'One'))
    await library.save(named('two', 'Two'))

    await library.list()
    files.reads.length = 0
    await library.list()
    // Only the index itself, however many scores there are.
    expect(files.reads).toEqual([`${root}/${INDEX_FILE}`])

    await library.save(named('two', 'Two, corrected'))
    files.reads.length = 0
    const listed = await library.list()
    expect(files.reads).toEqual([`${root}/${INDEX_FILE}`, `${root}/two${SCORE_SUFFIX}`])
    expect(listed.map((one) => one.metadata.title)).toContain('Two, corrected')
  })

  it('shows a score dropped into the folder by hand, and forgets one deleted', async () => {
    const files = memoryFiles()
    const library = createLibrary(root, files)
    await library.save(named('kept', 'Kept'))
    expect((await library.list()).map((one) => one.id)).toEqual(['kept'])

    await files.write(
      `${root}/by-hand${SCORE_SUFFIX}`,
      JSON.stringify(named('by-hand', 'Copied in')),
    )
    files.held.delete(`${root}/kept${SCORE_SUFFIX}`)
    expect((await library.list()).map((one) => one.id)).toEqual(['by-hand'])
  })

  it('rebuilds an index it cannot read, rather than failing or trusting it', async () => {
    const files = memoryFiles()
    const library = createLibrary(root, files)
    await library.save(named('one', 'One'))
    await library.list()

    for (const garbage of ['{ torn', '{"version":1,"files":{"x":{"size":"big"}}}', '[]']) {
      files.held.set(`${root}/${INDEX_FILE}`, garbage)
      expect((await library.list()).map((one) => one.id)).toEqual(['one'])
      expect(JSON.parse(files.held.get(`${root}/${INDEX_FILE}`) ?? '')).toMatchObject({
        version: 1,
      })
    }
  })

  it('does not read a broken score again until somebody changes it', async () => {
    const files = memoryFiles({ [`${root}/broken${SCORE_SUFFIX}`]: 'not json' })
    const library = createLibrary(root, files)
    await library.list()
    files.reads.length = 0
    await library.list()
    expect(files.reads).not.toContain(`${root}/broken${SCORE_SUFFIX}`)
  })

  it('keeps when a score first arrived through a rewrite of it', async () => {
    const files = memoryFiles()
    const library = createLibrary(root, files)
    await library.save(named('old', 'Old'))
    await library.save(named('new', 'New'))
    await library.list()
    await library.save(named('old', 'Old, corrected'))
    expect((await library.list('newest')).map((one) => one.id)).toEqual(['new', 'old'])
  })
})
