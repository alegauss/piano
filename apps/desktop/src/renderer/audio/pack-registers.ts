import type { PackManifest, PackSample, ReleaseSample } from '@piano/sample-pack'

/**
 * How a pack is loaded: in registers, nearest middle C first.
 *
 * A register is every recording made on one key, at every velocity: the
 * unit loaded and evicted together, because a note at one velocity is
 * usually followed by the same key at another. Loading starts where most
 * music lives and works outward, so the keys a piece is likeliest to need
 * are the first to stop falling back to the synthesiser.
 */

export const MIDDLE_C = 60

export type Register = {
  /** The key the recordings were made on. */
  readonly pitch: number
  readonly lowKey: number
  readonly highKey: number
  readonly samples: readonly PackSample[]
  /** The key-release recordings of the keys this register plays, loaded with it. */
  readonly releases: readonly ReleaseSample[]
}

/** Every register a pack holds, in the order they should load. */
export function registersOf(manifest: PackManifest): Register[] {
  const byPitch = new Map<number, PackSample[]>()
  for (const sample of manifest.samples) {
    const group = byPitch.get(sample.pitch)
    if (group === undefined) {
      byPitch.set(sample.pitch, [sample])
    } else {
      group.push(sample)
    }
  }
  const releases = manifest.releases?.samples ?? []
  return [...byPitch.entries()]
    .map(([pitch, samples]) => {
      const lowKey = Math.min(...samples.map((sample) => sample.lowKey))
      const highKey = Math.max(...samples.map((sample) => sample.highKey))
      return {
        pitch,
        lowKey,
        highKey,
        samples,
        releases: releases.filter((release) => release.key >= lowKey && release.key <= highKey),
      }
    })
    .sort(
      (a, b) => Math.abs(a.pitch - MIDDLE_C) - Math.abs(b.pitch - MIDDLE_C) || a.pitch - b.pitch,
    )
}

/** The register whose recordings play a key. */
export function registerFor(registers: readonly Register[], key: number): Register | undefined {
  return registers.find((register) => key >= register.lowKey && key <= register.highKey)
}

/** The recording that plays a key at a velocity. */
export function sampleFor(
  manifest: PackManifest,
  key: number,
  velocity: number,
): PackSample | undefined {
  return manifest.samples.find(
    (sample) =>
      key >= sample.lowKey &&
      key <= sample.highKey &&
      velocity >= sample.lowVelocity &&
      velocity <= sample.highVelocity,
  )
}

/**
 * What a register costs once decoded, before it is decoded: seconds times
 * rate times channels, four bytes a sample. Decoding resamples to the
 * context's rate, so that is the rate that counts.
 */
export function decodedBytes(register: Register, sampleRate: number, channels: number): number {
  return [...register.samples, ...register.releases].reduce(
    (sum, recording) => sum + Math.ceil(recording.seconds * sampleRate) * channels * 4,
    0,
  )
}

/** A recording to play and how loud, when a velocity falls between two layers. */
export type WeightedSample = {
  readonly sample: PackSample
  readonly gain: number
}

/** Velocities either side of a layer boundary over which the two layers crossfade. */
export const CROSSFADE_VELOCITIES = 6

/**
 * The recordings a key sounds at a velocity, with their gains.
 *
 * Mostly one. Near the boundary between two velocity layers both play, at
 * equal-power gains that meet halfway, so a crescendo passes from one
 * recording to the next without a step at the line the pack drew.
 */
export function weightedSamples(
  manifest: PackManifest,
  key: number,
  velocity: number,
): WeightedSample[] {
  const here = sampleFor(manifest, key, velocity)
  if (here === undefined) {
    return []
  }
  const sameKey = manifest.samples.filter((sample) => key >= sample.lowKey && key <= sample.highKey)
  const above = sameKey.find((sample) => sample.lowVelocity === here.highVelocity + 1)
  const below = sameKey.find((sample) => sample.highVelocity === here.lowVelocity - 1)

  // How far into the crossfade zone of each neighbour the velocity sits:
  // 0 at the zone's outer edge, 0.5 on the boundary itself.
  const width = CROSSFADE_VELOCITIES
  const towardAbove =
    above === undefined ? 0 : (velocity - (here.highVelocity + 0.5 - width)) / (2 * width)
  const towardBelow =
    below === undefined ? 0 : (here.lowVelocity - 0.5 + width - velocity) / (2 * width)

  const neighbour =
    towardAbove > 0 ? { sample: above, t: towardAbove } : { sample: below, t: towardBelow }
  if (neighbour.sample === undefined || neighbour.t <= 0) {
    return [{ sample: here, gain: 1 }]
  }
  const angle = (neighbour.t * Math.PI) / 2
  return [
    { sample: here, gain: Math.cos(angle) },
    { sample: neighbour.sample, gain: Math.sin(angle) },
  ]
}
