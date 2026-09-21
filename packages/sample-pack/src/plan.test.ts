import { describe, expect, it } from 'vitest'

import { HIGHEST_KEY, LOWEST_KEY, manifestProblems, type PackManifest } from './manifest'
import { planReleases, planSamples, SALAMANDER, velocityRanges } from './plan'
import { groupOpcode, parseDefines, parseRegions, parseVelocityLayers } from './sfz'

/** The notes file as Salamander writes it: sixteen layers, each a velocity range. */
const NOTES = `master_label=Notes

<group> #include "Data/vel_01.txt" lovel=1 hivel=26 #include "Data/region.txt"
<group> #include "Data/vel_02.txt" lovel=27 hivel=34 #include "Data/region.txt"
<group> #include "Data/vel_03.txt" lovel=35 hivel=36 #include "Data/region.txt"
<group> #include "Data/vel_04.txt" lovel=37 hivel=43 #include "Data/region.txt"
<group> #include "Data/vel_05.txt" lovel=44 hivel=46 #include "Data/region.txt"
<group> #include "Data/vel_06.txt" lovel=47 hivel=50 #include "Data/region.txt"
<group> #include "Data/vel_07.txt" lovel=51 hivel=56 #include "Data/region.txt"
<group> #include "Data/vel_08.txt" lovel=57 hivel=64 #include "Data/region.txt"
<group> #include "Data/vel_09.txt" lovel=65 hivel=72 #include "Data/region.txt"
<group> #include "Data/vel_10.txt" lovel=73 hivel=80 #include "Data/region.txt"
<group> #include "Data/vel_11.txt" lovel=81 hivel=88 #include "Data/region.txt"
<group> #include "Data/vel_12.txt" lovel=89 hivel=96 #include "Data/region.txt"
<group> #include "Data/vel_13.txt" lovel=97 hivel=104 #include "Data/region.txt"
<group> #include "Data/vel_14.txt" lovel=105 hivel=112 #include "Data/region.txt"
<group> #include "Data/vel_15.txt" lovel=113 hivel=120 #include "Data/region.txt"
<group> #include "Data/vel_16.txt" lovel=121 hivel=127 #include "Data/region.txt"
`

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/**
 * The region file's layout: A0 and then every minor third to C8, each
 * covering the key below and above, the top octaves undamped. Built rather
 * than pasted, from the same rule the file follows.
 */
function regionFile(): string {
  const lines = ['group_label=$VEL', '', '//Notes']
  let label = 1
  for (let pitch = 21; pitch <= 108; pitch += 3) {
    const name = `${NAMES[pitch % 12] ?? ''}${String(Math.floor(pitch / 12) - 1)}`
    const low = pitch === 21 ? 21 : pitch - 1
    const high = pitch === 108 ? 108 : pitch === 21 ? 22 : pitch + 1
    const undamped = pitch >= 90 ? ' ampeg_release=3' : ''
    const tune = `$TUNE${String(label).padStart(2, '0')}`
    lines.push(
      `<region> region_label=${String(label)} tune=${tune} offset_oncc$OFFSET=$OFF01${undamped} lokey=${String(low)} hikey=${String(high)} pitch_keycenter=${String(pitch)} sample=${name}$VEL.$EXT`,
    )
    label += 1
  }
  return lines.join('\n')
}

describe('parseRegions', () => {
  it('reads the keys, the recording and whether the string has a damper', () => {
    const [first] = parseRegions(
      '<region> region_label=24 tune=$TUNE24 ampeg_release=3 lokey=89 hikey=91 pitch_keycenter=90 sample=F#6$VEL.$EXT',
    )
    expect(first).toEqual({
      sample: 'F#6$VEL.$EXT',
      pitch: 90,
      lowKey: 89,
      highKey: 91,
      tune: '$TUNE24',
      undamped: true,
    })
  })

  it('refuses a region that names no key centre, rather than guessing one', () => {
    expect(() => parseRegions('<region> lokey=21 hikey=22 sample=A0$VEL.$EXT')).toThrow(
      /pitch_keycenter/,
    )
  })
})

describe('the key-release map', () => {
  const HAMMER = `master_label=HammerNoise
group=3

<group>
group_label=rel
amp_veltrack=82
volume=-37
rt_decay=2

<region> region_label=01 key=21 sample=rel1.$EXT
<region> region_label=02 key=22 sample=rel2.$EXT
`

  it('reads a one-key region as recorded on that key and playing only it', () => {
    expect(parseRegions(HAMMER)[1]).toEqual({
      sample: 'rel2.$EXT',
      pitch: 22,
      lowKey: 22,
      highKey: 22,
      undamped: false,
    })
  })

  it('reads the group settings a release plays by', () => {
    expect(groupOpcode(HAMMER, 'volume')).toBe(-37)
    expect(groupOpcode(HAMMER, 'amp_veltrack')).toBe(82)
    expect(groupOpcode(HAMMER, 'rt_decay')).toBe(2)
    expect(groupOpcode(HAMMER, 'missing')).toBeUndefined()
  })

  it('plans one release recording per key, fetched by the library name', () => {
    expect(planReleases(parseRegions(HAMMER))).toEqual([
      { source: 'Samples/rel1.flac', file: 'releases/21.ogg', key: 21 },
      { source: 'Samples/rel2.flac', file: 'releases/22.ogg', key: 22 },
    ])
  })
})

describe('parseVelocityLayers and parseDefines', () => {
  it('reads sixteen layers in order of loudness', () => {
    const layers = parseVelocityLayers(NOTES)
    expect(layers).toHaveLength(16)
    expect(layers[0]).toEqual({ layer: 1, lowVelocity: 1, highVelocity: 26 })
    expect(layers.at(-1)).toEqual({ layer: 16, lowVelocity: 121, highVelocity: 127 })
  })

  it('reads tuning defines as numbers, negative ones included', () => {
    const tuning = parseDefines('#define $TUNE01 10\n#define $TUNE04 -3\n')
    expect(tuning.get('$TUNE01')).toBe(10)
    expect(tuning.get('$TUNE04')).toBe(-3)
  })
})

describe('velocityRanges', () => {
  it('gives each kept layer the velocities recorded nearest it', () => {
    expect(velocityRanges(parseVelocityLayers(NOTES), [4, 8, 12, 16])).toEqual([
      { layer: 4, lowVelocity: 1, highVelocity: 50 },
      { layer: 8, lowVelocity: 51, highVelocity: 76 },
      { layer: 12, lowVelocity: 77, highVelocity: 108 },
      { layer: 16, lowVelocity: 109, highVelocity: 127 },
    ])
  })

  it('refuses a layer the library does not have', () => {
    expect(() => velocityRanges(parseVelocityLayers(NOTES), [4, 17])).toThrow(/17/)
  })
})

describe('planSamples', () => {
  const plan = planSamples(
    parseRegions(regionFile()),
    parseVelocityLayers(NOTES),
    SALAMANDER.layers,
    parseDefines('#define $TUNE02 13\n'),
  )

  it('plans one recording per region per kept layer', () => {
    expect(plan).toHaveLength(30 * 4)
  })

  it('names files so a URL needs no escaping, and fetches the library by its own names', () => {
    const sharp = plan.find((sample) => sample.pitch === 27 && sample.lowVelocity === 1)
    expect(sharp).toMatchObject({ source: 'Samples/D#1v4.flac', file: 'samples/Ds1-v4.ogg' })
  })

  it('carries a tuning correction and an undamped string where the library states them', () => {
    expect(plan.find((sample) => sample.pitch === 24)?.tuneCents).toBe(13)
    expect(plan.find((sample) => sample.pitch === 21)?.tuneCents).toBeUndefined()
    expect(plan.find((sample) => sample.pitch === 90)?.undamped).toBe(true)
    expect(plan.find((sample) => sample.pitch === 60)?.undamped).toBeUndefined()
  })

  it('covers every key at every velocity exactly once', () => {
    const manifest: PackManifest = {
      format: 1,
      id: SALAMANDER.id,
      version: 1,
      sampleRate: 48_000,
      channels: 2,
      credit: SALAMANDER.credit,
      samples: plan.map(({ source: _source, ...sample }) => ({
        ...sample,
        seconds: 1,
        bytes: 1,
        sha256: '0'.repeat(64),
      })),
    }
    expect(manifestProblems(manifest)).toEqual([])
    expect(Math.min(...plan.map((sample) => sample.lowKey))).toBe(LOWEST_KEY)
    expect(Math.max(...plan.map((sample) => sample.highKey))).toBe(HIGHEST_KEY)
  })
})
