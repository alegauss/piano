import { HISTORY_VERSION, type PracticeRecord } from '@piano/ipc'
import { describe, expect, it } from 'vitest'

import { historyFileName, saveHistory } from './history-save'

/** Taking a copy of the practice history away: where it goes, and what is in it. */

const records: PracticeRecord[] = [
  {
    score: 'sonata',
    fingerprint: 'abc',
    at: 1000,
    level: 'beginner',
    tempoScale: 0.6,
    sections: ['opening'],
    tally: { correct: 1, early: 0, late: 0, wrong: 0, missed: 1, extra: 0, of: 2 },
    bars: [{ bar: 2, faults: 1, of: 1 }],
  },
]

function deps(path: string | null) {
  const written: { path: string; text: string }[] = []
  const suggested: string[] = []
  return {
    written,
    suggested,
    choose: (name: string) => {
      suggested.push(name)
      return Promise.resolve(path)
    },
    write: (at: string, text: string) => {
      written.push({ path: at, text })
      return Promise.resolve()
    },
  }
}

describe('saving the practice history as a file', () => {
  it('suggests a dated name, so last month’s copy is not overwritten', () => {
    expect(historyFileName(new Date(2026, 0, 9))).toBe('piano-practice-2026-01-09.json')
  })

  it('writes the same shape the app keeps, so somebody can read it back', async () => {
    const fake = deps('/home/somebody/piano-practice-2026-01-09.json')
    const result = await saveHistory(records, fake, () => new Date(2026, 0, 9))

    expect(result).toEqual({ kind: 'saved', name: 'piano-practice-2026-01-09.json' })
    expect(fake.suggested).toEqual(['piano-practice-2026-01-09.json'])
    const held = JSON.parse(fake.written[0]?.text ?? '') as {
      version: number
      records: PracticeRecord[]
    }
    expect(held.version).toBe(HISTORY_VERSION)
    expect(held.records).toEqual(records)
  })

  it('writes nothing when the dialog is closed', async () => {
    const fake = deps(null)
    expect(await saveHistory(records, fake)).toEqual({ kind: 'cancelled' })
    expect(fake.written).toEqual([])
  })

  it('says why rather than throwing when the file cannot be written', async () => {
    const result = await saveHistory(records, {
      choose: () => Promise.resolve('/read-only/history.json'),
      write: () => Promise.reject(new Error('permission denied')),
    })
    expect(result).toMatchObject({ kind: 'refused' })
    expect(result).toHaveProperty('message', expect.stringContaining('permission denied'))
  })
})
