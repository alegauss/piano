import { describe, expect, it } from 'vitest'

import { gainToPeak, peakOf, secondsOf, trim, withGain, type Pcm } from './audio'

const RATE = 1000

/**
 * A recording as a library ships one: silence, then a struck string decaying
 * exponentially, then room noise nobody needs. Stereo, the right channel a
 * little quieter.
 */
function recording(silenceSeconds: number, ringSeconds: number, tau = 0.2): Pcm {
  const frames = Math.round((silenceSeconds + ringSeconds) * RATE)
  const data = new Float32Array(frames * 2)
  for (let frame = 0; frame < frames; frame += 1) {
    const time = frame / RATE - silenceSeconds
    const level = time < 0 ? 0 : 0.8 * Math.exp(-time / tau) * Math.cos(2 * Math.PI * 50 * time)
    data[frame * 2] = level
    data[frame * 2 + 1] = level * 0.9
  }
  return { data, channels: 2, sampleRate: RATE }
}

const OPTIONS = {
  onsetDb: -40,
  tailDb: -60,
  prerollSeconds: 0.003,
  fadeSeconds: 0.1,
  maxSeconds: 12,
}

describe('trim', () => {
  it('cuts the silence before the note, keeping a few milliseconds of it', () => {
    const cut = trim(recording(0.5, 2), OPTIONS)
    // The onset is the very first frame of the note; the pre-roll is three.
    expect(cut.data[0]).toBe(0)
    expect(Math.abs(cut.data[3 * 2] ?? 0)).toBeGreaterThan(0.5)
  })

  it('cuts the tail where the note has fallen sixty decibels', () => {
    // exp(-t/0.2) reaches -60 dB at t = 0.2 * ln(1000), about 1.38 seconds.
    const cut = trim(recording(0.5, 3), OPTIONS)
    expect(secondsOf(cut)).toBeGreaterThan(1.2)
    expect(secondsOf(cut)).toBeLessThan(1.45)
  })

  it('fades the cut to nothing, so it never clicks', () => {
    const cut = trim(recording(0, 3), OPTIONS)
    expect(cut.data.at(-1)).toBe(0)
    expect(cut.data.at(-2)).toBe(0)
  })

  it('keeps no more than the longest a recording may be', () => {
    const cut = trim(recording(0, 30, 10), { ...OPTIONS, maxSeconds: 5 })
    expect(secondsOf(cut)).toBeCloseTo(5, 6)
  })

  it('leaves the loudness alone, which normalising sets for the whole pack', () => {
    const source = recording(0.1, 2)
    expect(peakOf(trim(source, OPTIONS))).toBeCloseTo(peakOf(source), 6)
  })

  it('refuses a silent recording rather than keeping nothing', () => {
    expect(() => trim({ data: new Float32Array(100), channels: 2, sampleRate: RATE })).toThrow(
      /silent/,
    )
  })
})

describe('normalising', () => {
  it('brings the loudest peak to minus one decibel, and the rest by the same gain', () => {
    const loud = recording(0, 1)
    const soft = withGain(recording(0, 1), 0.25)
    const gain = gainToPeak(Math.max(peakOf(loud), peakOf(soft)), -1)
    expect(peakOf(withGain(loud, gain))).toBeCloseTo(10 ** (-1 / 20), 5)
    // The soft layer stays a quarter of the loud one: that difference is the recording.
    expect(peakOf(withGain(soft, gain)) / peakOf(withGain(loud, gain))).toBeCloseTo(0.25, 5)
  })
})
