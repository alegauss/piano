import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { HISTORY_VERSION, KEEP_RECORDS, storedHistory, type PracticeRecord } from '@piano/ipc'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createHistoryStore } from './history-store'

/**
 * The practice history on a real disk. A new store over the same file is what
 * a restart is, so that is how surviving one is asserted; erasing is checked
 * against the folder, because a file left behind is the whole point of the
 * door.
 */

let directory = ''
let file = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'piano-history-'))
  file = join(directory, 'profile', 'practice-history.json')
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

function record(over: Partial<PracticeRecord> = {}): PracticeRecord {
  return {
    score: 'sonata',
    fingerprint: 'abc',
    at: 1000,
    level: 'beginner',
    tempoScale: 0.6,
    sections: ['opening'],
    tally: { correct: 1, early: 0, late: 0, wrong: 0, missed: 1, extra: 0, of: 2 },
    bars: [{ bar: 2, faults: 1, of: 1 }],
    ...over,
  }
}

describe('the practice history between launches', () => {
  it('starts empty, and says it is the first launch', async () => {
    expect(await createHistoryStore(file).read()).toEqual({
      records: [],
      dropped: 0,
      notice: null,
      fresh: true,
    })
  })

  it('survives a restart, with the version beside the records', async () => {
    await createHistoryStore(file).write([record(), record({ at: 2000 })])

    const restarted = await createHistoryStore(file).read()
    expect(restarted.fresh).toBe(false)
    expect(restarted.notice).toBeNull()
    expect(restarted.records).toHaveLength(2)
    const written = JSON.parse(await readFile(file, 'utf8')) as { version: number }
    expect(written.version).toBe(HISTORY_VERSION)
  })

  it('loses only the record that is damaged, and counts it', async () => {
    // The first write is what makes the profile folder, as a launch would.
    await createHistoryStore(file).write([record()])
    await writeFile(
      file,
      JSON.stringify({
        version: HISTORY_VERSION,
        records: [record(), { score: 'sonata' }, record({ at: 2000 })],
      }),
    )

    const read = await createHistoryStore(file).read()
    expect(read.records).toHaveLength(2)
    expect(read.dropped).toBe(1)
    expect(read.notice).toBe('1 attempt could not be read and was left out.')
  })

  it('starts the history again for a file that is not JSON, and says so', async () => {
    await createHistoryStore(file).write([record()])
    await writeFile(file, '{ "records": [')
    const read = await createHistoryStore(file).read()
    expect(read.records).toEqual([])
    expect(read.notice).toContain('could not be read')
  })

  it('says where a history from a newer version came from', async () => {
    await createHistoryStore(file).write([])
    await writeFile(file, JSON.stringify({ version: HISTORY_VERSION + 1, records: [record()] }))
    const read = await createHistoryStore(file).read()
    expect(read.records).toHaveLength(1)
    expect(read.notice).toContain('newer version')
  })

  it('keeps no more than the cap, whatever a window sends', async () => {
    const many = Array.from({ length: KEEP_RECORDS + 10 }, (_, index) => record({ at: index + 1 }))
    await createHistoryStore(file).write(many)
    expect((await createHistoryStore(file).read()).records).toHaveLength(KEEP_RECORDS)
  })

  it('erases the file rather than emptying it, and reads as a first launch after', async () => {
    const store = createHistoryStore(file)
    await store.write([record()])
    await store.clear()

    expect(await readdir(join(directory, 'profile'))).toEqual([])
    expect(await createHistoryStore(file).read()).toMatchObject({ records: [], fresh: true })
    expect(await store.held()).toEqual([])
  })

  it('writes one change after another, and leaves no half-written file behind', async () => {
    const store = createHistoryStore(file)
    await Promise.all([
      store.write([record({ at: 1 })]),
      store.write([record({ at: 1 }), record({ at: 2 })]),
      store.write([record({ at: 1 }), record({ at: 2 }), record({ at: 3 })]),
    ])
    expect((await createHistoryStore(file).read()).records).toHaveLength(3)
    expect(await readdir(join(directory, 'profile'))).toEqual(['practice-history.json'])
  })

  it('hands over what every write so far left, which is what a saved copy is made of', async () => {
    const store = createHistoryStore(file)
    void store.write([record(), record({ at: 2000 })])
    expect(await store.held()).toHaveLength(2)
    expect(storedHistory(await store.held())['version']).toBe(HISTORY_VERSION)
  })
})
