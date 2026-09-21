import { describe, expect, it } from 'vitest'

import {
  bundlingProblems,
  compareForLibrary,
  isPublicDomainLicence,
  matchesFilter,
  validateMetadata,
  type ScoreMetadata,
} from './metadata'

function meta(overrides: Partial<ScoreMetadata> = {}): ScoreMetadata {
  return { title: 'Gymnopédie No. 1', ...overrides }
}

describe('what a score may not omit', () => {
  it('accepts a score that is only a title', () => {
    expect(validateMetadata(meta())).toEqual([])
  })

  it('refuses a title that says nothing', () => {
    expect(validateMetadata(meta({ title: '   ' })).join('\n')).toContain('needs a title')
  })

  it('refuses a difficulty outside one to ten', () => {
    expect(validateMetadata(meta({ difficulty: 0 })).join('\n')).toContain('1 to 10')
    expect(validateMetadata(meta({ difficulty: 11 })).join('\n')).toContain('1 to 10')
    expect(validateMetadata(meta({ difficulty: 4 }))).toEqual([])
  })

  it('refuses an empty tag, which no one can filter on', () => {
    expect(validateMetadata(meta({ tags: ['calm', ' '] })).join('\n')).toContain('tag is empty')
  })
})

describe('what may go in the installer', () => {
  it('accepts a public-domain source with a licence', () => {
    const score = meta({
      composer: 'Erik Satie',
      provenance: { source: 'IMSLP', licence: 'public-domain' },
    })
    expect(bundlingProblems(score)).toEqual([])
  })

  it('refuses a score with no provenance at all', () => {
    expect(bundlingProblems(meta()).join('\n')).toContain('no provenance')
  })

  it('refuses a licence that is not one the project may ship', () => {
    const score = meta({ provenance: { source: 'a publisher', licence: 'all-rights-reserved' } })
    expect(bundlingProblems(score).join('\n')).toContain('all-rights-reserved')
  })

  it('refuses a provenance that names no source', () => {
    const score = meta({ provenance: { source: '  ', licence: 'CC0' } })
    expect(bundlingProblems(score).join('\n')).toContain('no source')
  })

  it('knows which licences are safe', () => {
    expect(isPublicDomainLicence('CC0')).toBe(true)
    expect(isPublicDomainLicence('proprietary')).toBe(false)
  })
})

describe('finding a score in a library', () => {
  const library = [
    meta({
      title: 'Gymnopédie No. 1',
      composer: 'Erik Satie',
      level: 'beginner',
      difficulty: 3,
      tags: ['calm', 'solo'],
    }),
    meta({
      title: 'Clair de Lune',
      composer: 'Claude Debussy',
      level: 'advanced',
      difficulty: 8,
      tags: ['calm'],
    }),
    meta({
      title: 'Prelude in C',
      composer: 'J. S. Bach',
      level: 'intermediate',
      difficulty: 5,
      tags: ['study'],
    }),
  ]

  it('matches on title or composer, which is what people remember', () => {
    expect(library.filter((s) => matchesFilter(s, { text: 'satie' }))).toHaveLength(1)
    expect(library.filter((s) => matchesFilter(s, { text: 'prelude' }))).toHaveLength(1)
    expect(library.filter((s) => matchesFilter(s, { text: 'nothing' }))).toHaveLength(0)
  })

  it('filters by level', () => {
    expect(library.filter((s) => matchesFilter(s, { level: 'beginner' }))).toHaveLength(1)
  })

  it('filters by composer', () => {
    expect(library.filter((s) => matchesFilter(s, { composer: 'bach' }))).toHaveLength(1)
  })

  it('narrows as tags are added, which is what a filter should do', () => {
    expect(library.filter((s) => matchesFilter(s, { tags: ['calm'] }))).toHaveLength(2)
    expect(library.filter((s) => matchesFilter(s, { tags: ['calm', 'solo'] }))).toHaveLength(1)
  })

  it('returns everything for an empty filter', () => {
    expect(library.filter((s) => matchesFilter(s, {}))).toHaveLength(3)
  })

  it('sorts by level, then by how hard it is inside that level', () => {
    const sorted = [...library].sort(compareForLibrary).map((s) => s.level)
    expect(sorted).toEqual(['beginner', 'intermediate', 'advanced'])
  })

  it('orders two scores of one level by difficulty, then by title', () => {
    const same = [
      meta({ title: 'B piece', level: 'beginner', difficulty: 2 }),
      meta({ title: 'A piece', level: 'beginner', difficulty: 4 }),
      meta({ title: 'A other', level: 'beginner', difficulty: 2 }),
    ]
    expect([...same].sort(compareForLibrary).map((s) => s.title)).toEqual([
      'A other',
      'B piece',
      'A piece',
    ])
  })
})
