import { describe, expect, it } from 'vitest'

import { parseManifest, type PackSample } from './manifest'
import { SALAMANDER } from './plan'

function sample(overrides: Partial<PackSample> = {}): PackSample {
  return {
    file: 'samples/A0-v4.ogg',
    pitch: 60,
    lowKey: 21,
    highKey: 108,
    lowVelocity: 1,
    highVelocity: 127,
    seconds: 4,
    bytes: 1000,
    sha256: 'a'.repeat(64),
    ...overrides,
  }
}

function manifest(samples: PackSample[]) {
  return {
    format: 1,
    id: 'test-pack',
    version: 1,
    sampleRate: 48_000,
    channels: 2,
    credit: SALAMANDER.credit,
    samples,
  }
}

describe('parseManifest', () => {
  it('accepts one recording that covers the whole keyboard at every velocity', () => {
    expect(parseManifest(manifest([sample()])).ok).toBe(true)
  })

  it('names a key and velocity nothing plays', () => {
    const result = parseManifest(manifest([sample({ highVelocity: 100 })]))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.problems.join('\n')).toMatch(/nothing plays key 21 at velocity 101/)
  })

  it('names a key and velocity two recordings both claim', () => {
    const result = parseManifest(
      manifest([sample(), sample({ file: 'samples/C4-v4.ogg', lowKey: 60, highKey: 60 })]),
    )
    expect(!result.ok && result.problems.join('\n')).toMatch(
      /more than one recording plays key 60 at velocity 1/,
    )
  })

  it('refuses a recording made outside the keys it covers', () => {
    const result = parseManifest(manifest([sample({ pitch: 12 })]))
    expect(!result.ok && result.problems.join('\n')).toMatch(/recorded at 12/)
  })

  it('refuses a manifest without a credit, since the licence has to travel with the pack', () => {
    const { credit: _credit, ...uncredited } = manifest([sample()])
    const result = parseManifest(uncredited)
    expect(!result.ok && result.problems.join('\n')).toMatch(/credit/)
  })

  it('accepts a release recording for every key', () => {
    const releases = {
      gainDb: -37,
      velocityTracking: 0.82,
      decayDbPerSecond: 2,
      samples: Array.from({ length: 88 }, (_, index) => ({
        file: `releases/${String(21 + index)}.ogg`,
        key: 21 + index,
        seconds: 0.5,
        bytes: 10,
        sha256: 'b'.repeat(64),
      })),
    }
    expect(parseManifest({ ...manifest([sample()]), releases }).ok).toBe(true)
  })

  it('refuses a release set that leaves a key out', () => {
    const releases = {
      gainDb: -37,
      velocityTracking: 0.82,
      decayDbPerSecond: 2,
      samples: [
        { file: 'releases/21.ogg', key: 21, seconds: 0.5, bytes: 10, sha256: 'b'.repeat(64) },
      ],
    }
    const result = parseManifest({ ...manifest([sample()]), releases })
    expect(!result.ok && result.problems.join('\n')).toMatch(/key 22 has 0 release recordings/)
  })

  it('refuses a checksum that is not one', () => {
    const result = parseManifest(manifest([sample({ sha256: 'not-a-digest' })]))
    expect(!result.ok && result.problems.join('\n')).toMatch(/sha256/)
  })
})
