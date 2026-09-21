import { describe, expect, it } from 'vitest'

import { WebAudioClicker } from './clicker'
import type { PianoEngine } from './engine'
import { EngineSwitch } from './engine-switch'
import { createPiano } from './index'
import { bankOf, SampledEngine, type SampleBank } from './sampled-engine'
import { SynthEngine } from './synth-engine'

/**
 * Real sound, rendered offline.
 *
 * These run in Chromium because jsdom has no Web Audio, and they render into
 * an OfflineAudioContext because that needs no output device and gives the
 * same samples every run. What they check is what a listener would: silence
 * before a note, sound during it, silence after its release, and a pedal that
 * holds it.
 */

const RATE = 22_050

/** A recording made on the spot: a decaying sine at the pitch it claims. */
function recording(context: BaseAudioContext, pitch: number, seconds = 3): AudioBuffer {
  const buffer = context.createBuffer(1, Math.round(seconds * RATE), RATE)
  const data = buffer.getChannelData(0)
  const frequency = 440 * 2 ** ((pitch - 69) / 12)
  for (let index = 0; index < data.length; index += 1) {
    const time = index / RATE
    data[index] = Math.sin(2 * Math.PI * frequency * time) * Math.exp(-time / 2)
  }
  return buffer
}

type Make = (context: BaseAudioContext) => PianoEngine

const synth: Make = (context) => new SynthEngine(context)
const sampled: Make = (context) =>
  new SampledEngine(context, bankOf([{ pitch: 57, buffer: recording(context, 57) }]))

async function render(
  make: Make,
  play: (engine: PianoEngine) => void | Promise<void>,
  seconds = 2.5,
): Promise<Float32Array> {
  const context = new OfflineAudioContext(1, Math.round(seconds * RATE), RATE)
  const engine = make(context)
  await play(engine)
  const rendered = await context.startRendering()
  return rendered.getChannelData(0)
}

/** Root mean square between two times, which is what "how loud, there" means. */
function loudness(data: Float32Array, from: number, to: number): number {
  const start = Math.round(from * RATE)
  const end = Math.round(to * RATE)
  let sum = 0
  for (let index = start; index < end; index += 1) {
    sum += (data[index] ?? 0) ** 2
  }
  return Math.sqrt(sum / Math.max(1, end - start))
}

/** Upward zero crossings per second, which for one sine is its frequency. */
function frequency(data: Float32Array, from: number, to: number): number {
  let crossings = 0
  for (let index = Math.round(from * RATE) + 1; index < Math.round(to * RATE); index += 1) {
    if ((data[index - 1] ?? 0) < 0 && (data[index] ?? 0) >= 0) {
      crossings += 1
    }
  }
  return crossings / (to - from)
}

const SILENT = 1e-4

describe.each([
  ['synthesised', synth],
  ['sampled', sampled],
] as const)('the %s engine', (_name, make) => {
  it('is silent before a note, sounds during it, and stops after its release', async () => {
    const data = await render(make, (engine) => {
      engine.noteOn(60, 100, 0.5)
      engine.noteOff(60, 1)
    })
    expect(loudness(data, 0, 0.45)).toBeLessThan(SILENT)
    expect(loudness(data, 0.55, 0.95)).toBeGreaterThan(0.01)
    expect(loudness(data, 2.1, 2.5)).toBeLessThan(SILENT)
  })

  it('keeps a released note sounding while the sustain pedal is down', async () => {
    const pedalled = await render(make, (engine) => {
      engine.pedal('sustain', 127, 0)
      engine.noteOn(60, 100, 0.2)
      engine.noteOff(60, 0.5)
    })
    const dry = await render(make, (engine) => {
      engine.noteOn(60, 100, 0.2)
      engine.noteOff(60, 0.5)
    })
    // Well after the dry note's release has run its course.
    expect(loudness(pedalled, 1.6, 2)).toBeGreaterThan(0.01)
    expect(loudness(dry, 1.6, 2)).toBeLessThan(SILENT)
  })

  it('fades a released note at half pedal faster than held, slower than let go', async () => {
    const released = (sustain: number) =>
      render(make, (engine) => {
        engine.pedal('sustain', sustain, 0)
        engine.noteOn(60, 100, 0.1)
        engine.noteOff(60, 0.4)
      })
    const [held, half, dry] = await Promise.all([released(127), released(64), released(0)])
    const tail = (data: Float32Array) => loudness(data, 0.6, 0.9)
    expect(tail(half)).toBeLessThan(tail(held))
    expect(tail(half)).toBeGreaterThan(tail(dry) * 4)
  })

  it('plays a harder key louder', async () => {
    const soft = await render(make, (engine) => {
      engine.noteOn(60, 40, 0)
    })
    const hard = await render(make, (engine) => {
      engine.noteOn(60, 120, 0)
    })
    expect(loudness(hard, 0.1, 0.5) / loudness(soft, 0.1, 0.5)).toBeGreaterThan(4)
  })

  it('is silent at a master gain of zero', async () => {
    const data = await render(make, (engine) => {
      engine.setMasterGain(0)
      engine.noteOn(60, 100, 0.5)
    })
    expect(loudness(data, 0.6, 1)).toBeLessThan(SILENT)
  })

  it('stops everything it was asked to play', async () => {
    const data = await render(make, (engine) => {
      engine.noteOn(60, 100, 0.5)
      engine.noteOn(64, 100, 0.5)
      engine.stopAll()
    })
    expect(loudness(data, 0, 2.5)).toBeLessThan(SILENT)
  })

  it('refuses new notes once retired, and lets the old ones end', async () => {
    const data = await render(make, (engine) => {
      engine.noteOn(60, 100, 0.2)
      engine.retire(0.6)
      engine.noteOn(64, 100, 1)
    })
    expect(loudness(data, 0.3, 0.55)).toBeGreaterThan(0.01)
    expect(loudness(data, 1.8, 2.5)).toBeLessThan(SILENT)
  })
})

describe('the sampled engine', () => {
  it('retunes the nearest recording to the pitch asked for', async () => {
    // One recording at A3, played an octave up, has to come out at A4.
    const data = await render(sampled, (engine) => {
      engine.noteOn(69, 100, 0)
    })
    expect(frequency(data, 0.2, 1.2)).toBeCloseTo(440, -1)
  })

  it('plays nothing for a pitch no recording covers yet', async () => {
    const empty: SampleBank = bankOf([])
    const data = await render(
      (context) => new SampledEngine(context, empty),
      (engine) => {
        engine.noteOn(60, 100, 0.2)
      },
    )
    expect(loudness(data, 0, 2.5)).toBeLessThan(SILENT)
  })
})

describe('swapping engines under a playing piece', () => {
  it('lets a note struck on the old engine finish while the new one plays', async () => {
    const context = new OfflineAudioContext(1, Math.round(2.5 * RATE), RATE)
    const piano = new EngineSwitch(synth(context))
    piano.noteOn(48, 100, 0.1)
    await piano.use(sampled(context))
    piano.noteOn(69, 100, 0.6)
    piano.noteOff(48, 1)
    piano.noteOff(69, 1.2)
    const data = (await context.startRendering()).getChannelData(0)

    // Before the swap only the synthesised C3 sounds; the release still
    // reaches it after the swap, so everything is quiet by the end.
    expect(loudness(data, 0.2, 0.55)).toBeGreaterThan(0.01)
    expect(loudness(data, 0.7, 0.95)).toBeGreaterThan(0.01)
    expect(loudness(data, 2.2, 2.5)).toBeLessThan(SILENT)
  })
})

describe('createPiano', () => {
  it('starts on the synthesised engine, on the audio clock', () => {
    const piano = createPiano()
    expect(piano.engine.kind).toBe('synth')
    expect(piano.now()).toBeGreaterThanOrEqual(0)
  })
})

describe('the metronome click', () => {
  it('sounds each click, the downbeat higher and louder than the rest', async () => {
    const context = new OfflineAudioContext(1, Math.round(1 * RATE), RATE)
    const clicker = new WebAudioClicker(context)
    clicker.click(0.1, true)
    clicker.click(0.5, false)
    const data = (await context.startRendering()).getChannelData(0)
    expect(loudness(data, 0.1, 0.13)).toBeGreaterThan(loudness(data, 0.5, 0.53) * 1.3)
    expect(frequency(data, 0.1, 0.14)).toBeGreaterThan(frequency(data, 0.5, 0.54))
    expect(loudness(data, 0.3, 0.45)).toBeLessThan(SILENT)
  })

  it('silences the clicks not yet sounded', async () => {
    const context = new OfflineAudioContext(1, Math.round(1 * RATE), RATE)
    const clicker = new WebAudioClicker(context)
    clicker.click(0.5, true)
    clicker.stopAll()
    const data = (await context.startRendering()).getChannelData(0)
    expect(loudness(data, 0, 1)).toBeLessThan(SILENT)
  })
})
