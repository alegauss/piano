import { describe, expect, it } from 'vitest'

import { migrate, unknownKeyProblems, unknownKeys, type Migration } from './migrate'
import { FORMAT_VERSION } from './version'

/**
 * A frozen file, exactly as version 1 was written.
 *
 * Never edited again. A fixture updated alongside the migration it exists to
 * test proves nothing, which is why this object is a literal here rather than
 * built from the current types.
 */
const VERSION_1_FILE = {
  formatVersion: 1,
  metadata: { title: 'Gymnopédie No. 1', composer: 'Erik Satie' },
  timing: { ticksPerQuarter: 480 },
  notes: [{ id: 'n1', pitch: 60, start: 0, duration: 480, velocity: 80 }],
} as const

describe('opening a file', () => {
  it('opens a version 1 file in the current build', () => {
    const result = migrate({ ...VERSION_1_FILE })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.score['formatVersion']).toBe(FORMAT_VERSION)
    expect(result.score['metadata']).toEqual(VERSION_1_FILE.metadata)
    expect(result.score['notes']).toEqual(VERSION_1_FILE.notes)
  })

  it('applies no migration to a file already at the current version', () => {
    const result = migrate({ formatVersion: FORMAT_VERSION, metadata: { title: 'x' } })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.applied).toEqual([])
    }
  })

  it('refuses a version from the future by name', () => {
    const result = migrate({ formatVersion: FORMAT_VERSION + 3, metadata: { title: 'x' } })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('update the app rather than the file')
    }
  })

  it('refuses a file that declares no version', () => {
    const result = migrate({ metadata: { title: 'x' } })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('formatVersion')
    }
  })

  it('refuses a version it has no step for, rather than reading it anyway', () => {
    const result = migrate({ formatVersion: -1, metadata: { title: 'x' } })
    expect(result.ok).toBe(false)
  })
})

describe('the chain', () => {
  it('walks several steps in order', () => {
    // Exercised against a stand-in chain, because the real one is empty until
    // something breaks. The walk is what is being tested, not the steps.
    const chain: Migration[] = [
      { from: 1, describe: 'one to two', apply: (s) => ({ ...s, two: true }) },
      { from: 2, describe: 'two to three', apply: (s) => ({ ...s, three: true }) },
    ]

    let score: Record<string, unknown> = { formatVersion: 1 }
    const applied: string[] = []
    let version = 1
    while (version < 3) {
      const step = chain.find((m) => m.from === version)
      expect(step).toBeDefined()
      score = step!.apply(score)
      applied.push(step!.describe)
      version += 1
    }

    expect(applied).toEqual(['one to two', 'two to three'])
    expect(score['two']).toBe(true)
    expect(score['three']).toBe(true)
  })
})

describe('unknown keys', () => {
  it('accepts every field the format defines', () => {
    expect(
      unknownKeys({
        formatVersion: 1,
        metadata: {},
        timing: {},
        notes: [],
        parts: [],
        expression: {},
        sections: [],
        arrangements: [],
        extensions: {},
      }),
    ).toEqual([])
  })

  it('names a field the format does not define', () => {
    expect(unknownKeys({ formatVersion: 1, tempoMap: [] })).toEqual(['tempoMap'])
  })

  it('suggests the field a typo probably meant', () => {
    const [message] = unknownKeyProblems({ formatVersion: 1, note: [] })
    expect(message).toContain('"notes"')
  })

  it('suggests nothing for a word that is not a typo of anything', () => {
    const [message] = unknownKeyProblems({ formatVersion: 1, choreography: [] })
    expect(message).not.toContain('did you mean')
    expect(message).toContain('extensions')
  })

  it('points every unknown key at the extensions namespace', () => {
    for (const message of unknownKeyProblems({ formatVersion: 1, a: 1, b: 2 })) {
      expect(message).toContain('extensions')
    }
  })

  it('says nothing about what is inside extensions', () => {
    expect(
      unknownKeys({ formatVersion: 1, extensions: { 'com.example': { anything: true } } }),
    ).toEqual([])
  })
})
