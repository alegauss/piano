import { describe, expect, it } from 'vitest'

import { describeScore, FORMAT_VERSION, isSupportedVersion, type Score } from './score'

function score(overrides: Partial<Score> = {}): Score {
  return {
    formatVersion: FORMAT_VERSION,
    metadata: { title: 'Gymnopédie No. 1' },
    ...overrides,
  }
}

describe('describeScore', () => {
  it('names a score by its title alone when there is no composer', () => {
    expect(describeScore(score())).toBe('Gymnopédie No. 1')
  })

  it('names the composer when there is one', () => {
    const withComposer = score({ metadata: { title: 'Gymnopédie No. 1', composer: 'Erik Satie' } })
    expect(describeScore(withComposer)).toBe('Gymnopédie No. 1 — Erik Satie')
  })

  it('keeps a title that is only whitespace rather than inventing one', () => {
    // The validator's job is to refuse this; describing it is not the place to
    // silently substitute something that was never in the file.
    expect(describeScore(score({ metadata: { title: '   ' } }))).toBe('   ')
  })
})

describe('isSupportedVersion', () => {
  it('accepts the version this build writes', () => {
    expect(isSupportedVersion(score())).toBe(true)
  })

  it('refuses a version from the future', () => {
    expect(isSupportedVersion(score({ formatVersion: FORMAT_VERSION + 1 }))).toBe(false)
  })

  it('refuses an older version until the migration chain exists', () => {
    // PI14 replaces this equality with a walk through the chain. Until then a
    // version 0 file is honestly unsupported rather than quietly mis-read.
    expect(isSupportedVersion(score({ formatVersion: 0 }))).toBe(false)
  })
})
