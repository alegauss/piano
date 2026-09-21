import type { PackManifest, PackSample } from '@piano/sample-pack'
import { describe, expect, it } from 'vitest'

import { decodedBytes, registerFor, registersOf, sampleFor } from './pack-registers'

function recording(pitch: number, low: number, high: number, velocities: [number, number]) {
  return {
    file: `samples/${String(pitch)}-${String(velocities[0])}.ogg`,
    pitch,
    lowKey: low,
    highKey: high,
    lowVelocity: velocities[0],
    highVelocity: velocities[1],
    seconds: 2,
    bytes: 100,
    sha256: '0'.repeat(64),
  } satisfies PackSample
}

const manifest = {
  samples: [
    recording(48, 47, 49, [1, 63]),
    recording(48, 47, 49, [64, 127]),
    recording(60, 59, 61, [1, 63]),
    recording(60, 59, 61, [64, 127]),
    recording(57, 56, 58, [1, 127]),
    recording(72, 71, 73, [1, 127]),
  ],
  channels: 2,
} as unknown as PackManifest

describe('registersOf', () => {
  it('groups every velocity of one recorded key into one register', () => {
    const registers = registersOf(manifest)
    expect(registers.find((register) => register.pitch === 48)?.samples).toHaveLength(2)
  })

  it('orders registers outward from middle C, the nearer below first', () => {
    expect(registersOf(manifest).map((register) => register.pitch)).toEqual([60, 57, 48, 72])
  })
})

describe('releases', () => {
  it('load with the register that plays their key', () => {
    const release = (key: number) => ({
      file: `releases/${String(key)}.ogg`,
      key,
      seconds: 0.4,
      bytes: 10,
      sha256: '0'.repeat(64),
    })
    const withReleases = {
      ...manifest,
      releases: {
        gainDb: -37,
        velocityTracking: 0.82,
        decayDbPerSecond: 2,
        samples: [59, 60, 61, 62].map(release),
      },
    } as PackManifest
    const middle = registersOf(withReleases).find((register) => register.pitch === 60)
    expect(middle?.releases.map((r) => r.key)).toEqual([59, 60, 61])
  })
})

describe('registerFor and sampleFor', () => {
  it('finds the register a key is played from, including the keys shifted to', () => {
    expect(registerFor(registersOf(manifest), 61)?.pitch).toBe(60)
    expect(registerFor(registersOf(manifest), 90)).toBeUndefined()
  })

  it('picks the recording by velocity within the register', () => {
    expect(sampleFor(manifest, 59, 30)?.file).toBe('samples/60-1.ogg')
    expect(sampleFor(manifest, 59, 100)?.file).toBe('samples/60-64.ogg')
  })
})

describe('decodedBytes', () => {
  it('prices a register as seconds times rate times channels, four bytes a sample', () => {
    const [middle] = registersOf(manifest)
    expect(middle === undefined ? 0 : decodedBytes(middle, 48_000, 2)).toBe(2 * 2 * 48_000 * 2 * 4)
  })
})
