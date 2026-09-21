import { describe, expect, it } from 'vitest'

import {
  HISTORY_VERSION,
  KEEP_RECORDS,
  practiceRecordSchema,
  readHistory,
  storedHistory,
  type PracticeRecord,
} from './history'

/**
 * Reading a practice history out of whatever the file held. One damaged record
 * costs that record and nothing else, because the rest is weeks of somebody's
 * practice.
 */

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

describe('reading the practice history', () => {
  it('keeps every record that is valid and counts the ones that are not', () => {
    const read = readHistory({
      version: HISTORY_VERSION,
      records: [record(), { score: 'sonata' }, record({ at: 2000, tempoScale: -1 })],
    })
    expect(read.records).toHaveLength(1)
    expect(read.dropped).toBe(2)
    expect(read.newer).toBe(false)
  })

  it('reads a history that is not one at all as an empty one', () => {
    for (const raw of [null, [], 'history', 7, { version: 1 }]) {
      expect(readHistory(raw)).toMatchObject({ records: [], dropped: 0 })
    }
  })

  it('says when the file came from a newer version of the app', () => {
    expect(readHistory({ version: HISTORY_VERSION + 1, records: [] }).newer).toBe(true)
  })

  it('reads back exactly what it writes, with the version beside it', () => {
    const records = [record(), record({ at: 2000, level: null, sections: [] })]
    const written = storedHistory(records)
    expect(written['version']).toBe(HISTORY_VERSION)
    expect(readHistory(JSON.parse(JSON.stringify(written))).records).toEqual(records)
  })

  it('keeps the newest records where a file holds more than the cap, and calls none of them dropped', () => {
    const many = Array.from({ length: KEEP_RECORDS + 10 }, (_, index) => record({ at: index + 1 }))
    const read = readHistory({ version: HISTORY_VERSION, records: many })
    expect(read.records).toHaveLength(KEEP_RECORDS)
    expect(read.records.at(-1)?.at).toBe(KEEP_RECORDS + 10)
    expect(read.dropped).toBe(0)
  })

  it('refuses a record whose counts, level or bars are not what a record holds', () => {
    expect(practiceRecordSchema.safeParse(record()).success).toBe(true)
    expect(practiceRecordSchema.safeParse({ ...record(), at: -1 }).success).toBe(false)
    expect(practiceRecordSchema.safeParse({ ...record(), level: 'expert' }).success).toBe(false)
    expect(
      practiceRecordSchema.safeParse({ ...record(), bars: [{ bar: 1, faults: 1 }] }).success,
    ).toBe(false)
  })

  it('leaves behind anything that is not part of a record, notes included', () => {
    const parsed = practiceRecordSchema.safeParse({
      ...record(),
      notes: [{ pitch: 60, start: 0 }],
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data).not.toHaveProperty('notes')
  })
})
