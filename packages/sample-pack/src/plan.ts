import type { Credit } from './manifest'
import type { SfzRegion, VelocityLayer } from './sfz'

/**
 * What the pack is built from and what it keeps.
 *
 * Pinned to one commit of the library, so the same command fetches the same
 * bytes next year; sources.lock.json holds a checksum for each of them.
 */
export const SALAMANDER = {
  id: 'salamander-grand-v3',
  /** Bump whenever the recordings kept or their processing change. */
  version: 1,
  repository: 'sfzinstruments/SalamanderGrandPiano',
  commit: '3382bf9496bba2486f5ab0de55a264d1dfc38404',
  regionFile: 'Data/region.txt',
  layerFile: 'Data/notes.txt',
  tuningFile: 'Data/tune_nat.txt',
  licenceFile: 'LICENSE',
  sampleDirectory: 'Samples',
  extension: 'flac',
  /**
   * Four of the sixteen velocity layers, spread from soft to loud. Enough for
   * a struck key to change colour with force, and a quarter of the size.
   * Crossfading between them is PI22's.
   */
  layers: [4, 8, 12, 16],
  credit: {
    title: 'Salamander Grand Piano V3',
    author: 'Alexander Holm',
    licence: 'CC-BY-3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    source:
      'https://github.com/sfzinstruments/SalamanderGrandPiano/tree/3382bf9496bba2486f5ab0de55a264d1dfc38404',
    licenceFile: 'LICENSE.txt',
    notes:
      'A Yamaha C5 recorded by Alexander Holm; SFZ mapping by kinwie. Trimmed, normalised and re-encoded to Opus for this app; four of the sixteen velocity layers are kept.',
  } satisfies Credit,
} as const

/** One recording the pack will hold, and what it plays. */
export type PlannedSample = {
  /** Path of the recording in the library's repository. */
  readonly source: string
  /** Path of the encoded file inside the pack. */
  readonly file: string
  readonly pitch: number
  readonly lowKey: number
  readonly highKey: number
  readonly lowVelocity: number
  readonly highVelocity: number
  readonly tuneCents?: number
  readonly undamped?: boolean
}

/**
 * The velocities each kept layer answers.
 *
 * A dropped layer's velocities go to whichever kept layer was recorded
 * nearest them: the boundary sits halfway between two kept layers' centres,
 * so a soft note is never played from a loud recording turned down.
 */
export function velocityRanges(
  layers: readonly VelocityLayer[],
  keep: readonly number[],
): { readonly layer: number; readonly lowVelocity: number; readonly highVelocity: number }[] {
  const kept = layers
    .filter((layer) => keep.includes(layer.layer))
    .sort((a, b) => a.lowVelocity - b.lowVelocity)
  const missing = keep.filter((wanted) => !kept.some((layer) => layer.layer === wanted))
  if (missing.length > 0) {
    throw new Error(`the library has no velocity layer ${missing.join(', ')}`)
  }
  const centres = kept.map((layer) => (layer.lowVelocity + layer.highVelocity) / 2)

  return kept.map((layer, index) => {
    const below = centres[index - 1]
    const here = centres[index] ?? 0
    const above = centres[index + 1]
    return {
      layer: layer.layer,
      lowVelocity: below === undefined ? 1 : Math.floor((below + here) / 2) + 1,
      highVelocity: above === undefined ? 127 : Math.floor((here + above) / 2),
    }
  })
}

/** A pitch name fit for a file name: D#1 becomes Ds1, since # means something in a URL. */
function fileSafe(name: string): string {
  return name.replace('#', 's')
}

/** Every recording to fetch and encode, with the keys and velocities each will play. */
export function planSamples(
  regions: readonly SfzRegion[],
  layers: readonly VelocityLayer[],
  keep: readonly number[],
  tuning: ReadonlyMap<string, number> = new Map(),
): PlannedSample[] {
  const ranges = velocityRanges(layers, keep)
  return regions.flatMap((region) =>
    ranges.map((range) => {
      const velocity = `v${String(range.layer)}`
      const sourceName = region.sample
        .replace('$VEL', velocity)
        .replace('$EXT', SALAMANDER.extension)
      const pitchName = region.sample.replace('$VEL', '').replace('.$EXT', '')
      const tuneCents = region.tune === undefined ? undefined : tuning.get(region.tune)
      return {
        source: `${SALAMANDER.sampleDirectory}/${sourceName}`,
        file: `samples/${fileSafe(pitchName)}-${velocity}.ogg`,
        pitch: region.pitch,
        lowKey: region.lowKey,
        highKey: region.highKey,
        lowVelocity: range.lowVelocity,
        highVelocity: range.highVelocity,
        ...(tuneCents !== undefined && tuneCents !== 0 ? { tuneCents } : {}),
        ...(region.undamped ? { undamped: true } : {}),
      }
    }),
  )
}
