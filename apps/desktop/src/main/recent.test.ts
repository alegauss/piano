import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createRecent, MAX_RECENT, samePath } from './recent'

/**
 * The recent list on a real disk: newest first, one entry per file, no
 * longer than a menu can show, and never a reason for an open to fail.
 */

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'piano-recent-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

const entry = (name: string) => ({ path: `/music/${name}.json`, name: `${name}.json`, title: name })

describe('the recent list', () => {
  it('keeps the newest first, and moves a score opened again to the top', async () => {
    const recent = createRecent(join(directory, 'recent.json'))
    await recent.add(entry('one'))
    await recent.add(entry('two'))
    await recent.add(entry('one'))
    expect((await recent.list()).map((one) => one.title)).toEqual(['one', 'two'])
  })

  it('puts an entry right when the file it names is corrected, keeping its place', async () => {
    const recent = createRecent(join(directory, 'recent.json'))
    await recent.add(entry('one'))
    await recent.add(entry('two'))

    const put = await recent.corrected('/music/one.json', {
      path: '/music/prelude.json',
      name: 'prelude.json',
      title: 'Prelude',
    })

    // What changed about the piece is not when it was last opened.
    expect(put.map((each) => each.title)).toEqual(['two', 'Prelude'])
    expect(await recent.list()).toEqual(put)
    expect(await recent.has('/music/prelude.json')).toBe(true)
    expect(await recent.has('/music/one.json')).toBe(false)
  })

  it('writes nothing where no entry names that file, which is the ordinary case', async () => {
    const path = join(directory, 'recent.json')
    const recent = createRecent(path)
    await recent.add(entry('one'))
    const before = await readFile(path, 'utf8')

    const put = await recent.corrected('/music/never-opened.json', entry('other'))

    expect(put.map((each) => each.title)).toEqual(['one'])
    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('stops offering a file that has gone, and leaves the others where they are', async () => {
    const recent = createRecent(join(directory, 'recent.json'))
    await recent.add(entry('one'))
    await recent.add(entry('two'))

    const left = await recent.dropped('/music/one.json')

    expect(left.map((each) => each.title)).toEqual(['two'])
    expect(await recent.list()).toEqual(left)
    expect(await recent.has('/music/one.json')).toBe(false)
  })

  it('writes nothing where no entry names that file, which is most deletions', async () => {
    const path = join(directory, 'recent.json')
    const recent = createRecent(path)
    await recent.add(entry('one'))
    const before = await readFile(path, 'utf8')

    const left = await recent.dropped('/music/never-opened.json')

    expect(left.map((each) => each.title)).toEqual(['one'])
    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('holds no more than a menu shows', async () => {
    const recent = createRecent(join(directory, 'recent.json'))
    for (let index = 0; index < MAX_RECENT + 3; index += 1) {
      await recent.add(entry(`piece-${String(index)}`))
    }
    const listed = await recent.list()
    expect(listed).toHaveLength(MAX_RECENT)
    expect(listed[0]?.title).toBe(`piece-${String(MAX_RECENT + 2)}`)
  })

  it('survives a restart, which is the whole point of it', async () => {
    const file = join(directory, 'nested', 'recent.json')
    await createRecent(file).add(entry('kept'))
    expect(await createRecent(file).has('/music/kept.json')).toBe(true)
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ entries: [{ title: 'kept' }] })
  })

  it('reads a list it cannot understand as empty, rather than failing', async () => {
    const file = join(directory, 'recent.json')
    await writeFile(file, '{ this is not json')
    const recent = createRecent(file)
    expect(await recent.list()).toEqual([])
    await recent.add(entry('fresh'))
    expect((await recent.list()).map((one) => one.title)).toEqual(['fresh'])
  })

  it('empties when asked', async () => {
    const recent = createRecent(join(directory, 'recent.json'))
    await recent.add(entry('gone'))
    await recent.clear()
    expect(await recent.list()).toEqual([])
    expect(await recent.has('/music/gone.json')).toBe(false)
  })

  it('treats two spellings of one file as one where the platform does', () => {
    expect(samePath('C:\\Music\\A.json', 'c:\\music\\a.json', 'win32')).toBe(true)
    expect(samePath('/music/A.json', '/music/a.json', 'linux')).toBe(false)
  })
})
