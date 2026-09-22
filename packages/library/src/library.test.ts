import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { LEGACY_SCORE_SUFFIX, SCORE_SUFFIX, safeName } from '@piano/ipc'
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

  it('still lists and reads a score kept under the suffix it had before', async () => {
    const files = memoryFiles({
      [`${root}/aria${LEGACY_SCORE_SUFFIX}`]: JSON.stringify(named('aria', 'Aria')),
    })
    const library = createLibrary(root, files)
    expect((await library.list()).map((entry) => entry.id)).toEqual(['aria'])
    expect((await library.read('aria')).metadata.title).toBe('Aria')
  })

  it('lists one score where an id is there under both suffixes, the one written now', async () => {
    const files = memoryFiles({
      [`${root}/aria${LEGACY_SCORE_SUFFIX}`]: JSON.stringify(named('aria', 'Old aria')),
      [`${root}/aria${SCORE_SUFFIX}`]: JSON.stringify(named('aria', 'Aria')),
    })
    const library = createLibrary(root, files)
    const listed = await library.list()
    expect(listed.map((entry) => entry.metadata.title)).toEqual(['Aria'])
    expect((await library.read('aria')).metadata.title).toBe('Aria')
  })

  it('moves a score to the new suffix when it is saved again, leaving no old copy', async () => {
    const files = memoryFiles({
      [`${root}/aria${LEGACY_SCORE_SUFFIX}`]: JSON.stringify(named('aria', 'Old aria')),
    })
    await createLibrary(root, files).save(named('aria', 'Aria'))
    expect([...files.held.keys()].filter((path) => path !== `${root}/${INDEX_FILE}`)).toEqual([
      `${root}/aria${SCORE_SUFFIX}`,
    ])
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

describe('asking whether an id is taken', () => {
  it('describes the piece that is there, and answers nothing for one that is not', async () => {
    const library = createLibrary(root, memoryFiles())
    await library.save(named('bwv-846', 'Prelude', { composer: 'Bach' }))

    const held = await library.held('bwv-846')
    expect(held?.metadata.title).toBe('Prelude')
    expect(held?.metadata.composer).toBe('Bach')
    expect(held?.seconds).toBeGreaterThanOrEqual(0)
    expect(await library.held('nobody-saved-this')).toBeNull()
  })

  it('finds a score still under the suffix it was written with before', async () => {
    const files = memoryFiles({
      [`${root}/bwv-846${LEGACY_SCORE_SUFFIX}`]: JSON.stringify(named('bwv-846', 'Prelude')),
    })
    expect((await createLibrary(root, files).held('bwv-846'))?.metadata.title).toBe('Prelude')
  })

  it('answers nothing for a file the format refuses, as the listing leaves it out', async () => {
    const files = memoryFiles({ [`${root}/broken${SCORE_SUFFIX}`]: '{ not json' })
    expect(await createLibrary(root, files).held('broken')).toBeNull()
  })

  it('offers the id itself where it is free, and numbers it where it is not', async () => {
    const library = createLibrary(root, memoryFiles())
    expect(await library.free('prelude')).toBe('prelude')

    await library.save(named('prelude', 'Prelude'))
    expect(await library.free('prelude')).toBe('prelude-2')

    await library.save(named('prelude-2', 'Prelude again'))
    expect(await library.free('prelude')).toBe('prelude-3')
  })

  it('keeps room for the number in an id already as long as a name may be', async () => {
    // Cut to length after the number is added, the number would be the part
    // that went, and the answer would be the taken id over again.
    const long = 'a'.repeat(64)
    const library = createLibrary(root, memoryFiles())
    await library.save(named(long, 'Long'))

    const free = await library.free(long)
    expect(free).not.toBe(safeName(long))
    expect(free.endsWith('-2')).toBe(true)
    expect(free.length).toBeLessThanOrEqual(64)
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
        expect(name).toMatch(/^[a-z0-9-]+\.piano$/)
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

describe('the scores an app ships with', () => {
  const shipped = [named('ode', 'Ode'), named('minuet', 'Minuet')]

  it('are put in the library once', async () => {
    const files = memoryFiles()
    const library = createLibrary(root, files)
    expect(await library.seed(shipped)).toEqual(['ode', 'minuet'])
    expect(await library.seed(shipped)).toEqual([])
    expect((await library.list()).map((one) => one.id).sort()).toEqual(['minuet', 'ode'])
  })

  it('stay gone once somebody deletes one', async () => {
    const files = memoryFiles()
    const library = createLibrary(root, files)
    await library.seed(shipped)
    files.held.delete(`${root}/ode${SCORE_SUFFIX}`)
    expect(await library.seed(shipped)).toEqual([])
    expect((await library.list()).map((one) => one.id)).toEqual(['minuet'])
  })

  it('never overwrite a score of somebody’s own with the same id', async () => {
    const files = memoryFiles()
    const library = createLibrary(root, files)
    await library.save(named('ode', 'My own ode'))
    expect(await library.seed(shipped)).toEqual(['minuet'])
    expect((await library.read('ode')).metadata.title).toBe('My own ode')
  })

  it('never overwrite one kept under the suffix scores had before, either', async () => {
    const files = memoryFiles({
      [`${root}/ode${LEGACY_SCORE_SUFFIX}`]: JSON.stringify(named('ode', 'My own ode')),
    })
    const library = createLibrary(root, files)
    expect(await library.seed(shipped)).toEqual(['minuet'])
    expect((await library.read('ode')).metadata.title).toBe('My own ode')
  })

  it('refuse to seed a score that is not valid, rather than shipping one', async () => {
    const library = createLibrary(root, memoryFiles())
    await expect(library.seed([{ formatVersion: 1, metadata: {} }])).rejects.toThrow('not valid')
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
