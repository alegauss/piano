import { describe, expect, it } from 'vitest'

import {
  checksum,
  FROZEN_FIXTURES,
  MALFORMED_FIXTURES,
  stableStringify,
  VALID_FIXTURES,
} from './fixtures/index'
import { parseScore } from './parse'

describe('every reference score', () => {
  it.each(Object.keys(VALID_FIXTURES))('%s parses', (name) => {
    const fixture = VALID_FIXTURES[name as keyof typeof VALID_FIXTURES]
    const result = parseScore(fixture)
    if (!result.ok) {
      throw new Error(`${name} did not parse:\n${result.message}`)
    }
    expect(result.ok).toBe(true)
  })

  it.each(Object.keys(VALID_FIXTURES))('%s round-trips identically after normalisation', (name) => {
    // What this catches is a field quietly dropped by a refactor of the
    // loader: the score comes back looking fine and is missing something.
    const fixture = VALID_FIXTURES[name as keyof typeof VALID_FIXTURES]
    const result = parseScore(fixture)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(stableStringify(result.score)).toBe(stableStringify(fixture))
  })

  it('survives a trip through JSON, which is how it reaches disk', () => {
    for (const [name, fixture] of Object.entries(VALID_FIXTURES)) {
      const through = JSON.parse(JSON.stringify(fixture)) as unknown
      const result = parseScore(through)
      expect(result.ok, name).toBe(true)
      if (result.ok) {
        expect(stableStringify(result.score), name).toBe(stableStringify(fixture))
      }
    }
  })

  it('keeps whatever is under extensions', () => {
    const result = parseScore(VALID_FIXTURES['three-levels'])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.score.extensions).toEqual({
        'com.example.study': { notes: 'kept across a round trip' },
      })
    }
  })
})

describe('every malformed score', () => {
  it.each(MALFORMED_FIXTURES.map((f) => [f.name, f] as const))(
    '%s is refused, and the message says why',
    (_name, fixture) => {
      const result = parseScore(fixture.score)
      expect(result.ok).toBe(false)
      if (result.ok) {
        return
      }
      // Failing is not enough: the message has to name the thing that is wrong,
      // because the next reader is usually a model repairing its own output.
      expect(result.message.toLowerCase()).toContain(fixture.mentions.toLowerCase())
    },
  )

  it('covers one rule per fixture, with no two testing the same thing', () => {
    const mentions = MALFORMED_FIXTURES.map((f) => f.mentions)
    expect(new Set(mentions).size).toBe(mentions.length)
  })
})

describe('the frozen fixtures', () => {
  it.each(FROZEN_FIXTURES.map((f) => [f.name, f] as const))(
    '%s still opens in the current build',
    (_name, fixture) => {
      expect(parseScore(fixture.score).ok).toBe(true)
    },
  )

  it.each(FROZEN_FIXTURES.map((f) => [f.name, f] as const))(
    '%s has not been edited',
    (_name, fixture) => {
      // A fixture updated alongside the migration it exists to test proves
      // nothing. This is what keeps that promise rather than asking nicely.
      expect(
        checksum(fixture.score),
        `${fixture.name} changed; a frozen fixture is never edited, it is superseded by a new one`,
      ).toBe(fixture.checksum)
    },
  )
})

describe('stableStringify', () => {
  it('renders the same object identically whatever order its keys arrived in', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
  })

  it('keeps array order, which is meaning rather than presentation', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
  })

  it('leaves out a key whose value is absent', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }))
  })

  it('gives different objects different checksums', () => {
    expect(checksum({ a: 1 })).not.toBe(checksum({ a: 2 }))
  })
})
