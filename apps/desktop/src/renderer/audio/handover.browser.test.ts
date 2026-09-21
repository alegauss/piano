import { SALAMANDER } from '@piano/sample-pack'
import { describe, expect, it } from 'vitest'
import { server } from 'vitest/browser'

import type { PianoEngine } from './engine'
import { PackBank, urlPackSource } from './pack-bank'
import { SampledEngine } from './sampled-engine'
import { ONSET_SECONDS, SynthEngine, voicePeak } from './synth-engine'

/**
 * The handover, measured: a key plays synthesised until its recordings
 * arrive, so the synthesised voice has to match them in loudness and onset.
 *
 * The part that needs the real pack runs wherever `npm run pack:samples` has
 * built one and is skipped elsewhere, CI included; it is what the voice was
 * fitted with, and what says so again after the pack changes. The rest holds
 * the fit itself wherever the tests run.
 */

const RATE = 48_000

function rmsDb(data: Float32Array, from: number, to: number): number {
  let sum = 0
  const start = Math.round(from * RATE)
  const end = Math.round(to * RATE)
  for (let index = start; index < end; index += 1) {
    sum += (data[index] ?? 0) ** 2
  }
  return 20 * Math.log10(Math.sqrt(sum / (end - start)) + 1e-12)
}

/** Milliseconds until the sound first reaches a tenth of its peak. */
function onsetMs(data: Float32Array): number {
  let peak = 0
  for (const value of data) {
    peak = Math.max(peak, Math.abs(value))
  }
  return (data.findIndex((value) => Math.abs(value) > peak * 0.1) / RATE) * 1000
}

async function strike(
  make: (context: BaseAudioContext) => Promise<PianoEngine>,
  pitch: number,
  velocity: number,
): Promise<Float32Array> {
  const context = new OfflineAudioContext(1, Math.round(RATE * 0.6), RATE)
  const engine = await make(context)
  engine.noteOn(pitch, velocity, 0)
  return (await context.startRendering()).getChannelData(0)
}

/** The pack `npm run pack:samples` builds, as the dev server serves it, or null where there is none. */
async function builtPack(): Promise<string | null> {
  const root = server.config.root.replace(/\\/g, '/')
  const base = new URL(
    `/@fs/${root}/../../packages/sample-pack/out/${SALAMANDER.id}-${String(SALAMANDER.version)}/`,
    location.origin,
  ).href
  try {
    return (await fetch(new URL('manifest.json', base))).ok ? base : null
  } catch {
    return null
  }
}

const pack = await builtPack()

describe.skipIf(pack === null)('against the installed recordings', () => {
  it('is as loud as they are across the keyboard, and never far off at any key', async () => {
    const gaps: number[] = []
    for (const pitch of [24, 36, 48, 60, 67, 72, 79, 84, 96]) {
      for (const velocity of [50, 90]) {
        const synth = await strike(
          (context) => Promise.resolve(new SynthEngine(context)),
          pitch,
          velocity,
        )
        const recorded = await strike(
          async (context) => {
            const bank = await PackBank.open(context, urlPackSource(pack ?? ''))
            await bank.load(new Set([pitch]))
            return new SampledEngine(context, bank)
          },
          pitch,
          velocity,
        )
        gaps.push(rmsDb(synth, 0, 0.5) - rmsDb(recorded, 0, 0.5))
      }
    }
    const mean = gaps.reduce((sum, gap) => sum + Math.abs(gap), 0) / gaps.length
    // Before the fit the synthesised voice was 7 to 30 dB louder.
    expect(mean).toBeLessThan(4.5)
    expect(Math.max(...gaps.map(Math.abs))).toBeLessThan(12)
  }, 120_000)

  it('lands its attack where the recordings land their hammer, at middle C', async () => {
    const synth = await strike((context) => Promise.resolve(new SynthEngine(context)), 60, 80)
    const recorded = await strike(
      async (context) => {
        const bank = await PackBank.open(context, urlPackSource(pack ?? ''))
        await bank.load(new Set([60]))
        return new SampledEngine(context, bank)
      },
      60,
      80,
    )
    expect(Math.abs(onsetMs(synth) - onsetMs(recorded))).toBeLessThan(2)
  }, 60_000)
})

describe('the synthesised voice, as fitted', () => {
  it('stays silent through the silence a recording keeps before its hammer', async () => {
    const data = await strike((context) => Promise.resolve(new SynthEngine(context)), 60, 100)
    expect(rmsDb(data, 0, ONSET_SECONDS - 0.0005)).toBeLessThan(-100)
    expect(rmsDb(data, ONSET_SECONDS + 0.004, ONSET_SECONDS + 0.05)).toBeGreaterThan(-60)
  })

  it('grows quieter towards the treble, as the recordings do', () => {
    const tilt = 20 * Math.log10(voicePeak(84) / voicePeak(60))
    expect(tilt).toBeCloseTo(-0.22 * 24, 5)
  })
})
