import type { PackManifest, PackSample } from '@piano/sample-pack'

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
  return [...byPitch.entries()]
    .map(([pitch, samples]) => ({
      pitch,
      lowKey: Math.min(...samples.map((sample) => sample.lowKey)),
      highKey: Math.max(...samples.map((sample) => sample.highKey)),
      samples,
    }))
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
  return register.samples.reduce(
    (sum, sample) => sum + Math.ceil(sample.seconds * sampleRate) * channels * 4,
    0,
  )
}
