import type { PedalKind, Score } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import type { AudioTime, EngineKind, PianoEngine } from './engine'
import { EngineSwitch } from './engine-switch'

/** An engine that writes down every call, so a test can say which engine heard what. */
class Recorder implements PianoEngine {
  readonly calls: string[] = []
  prepared: Score | null = null
  retiredAt: AudioTime | null = null

  constructor(readonly kind: EngineKind) {}

  prepare(score: Score): Promise<void> {
    this.prepared = score
    this.calls.push(`prepare ${score.metadata.title}`)
    return Promise.resolve()
  }
  noteOn(pitch: number, velocity: number, at: AudioTime): void {
    this.calls.push(`on ${String(pitch)} ${String(velocity)} @${String(at)}`)
  }
  noteOff(pitch: number, at: AudioTime): void {
    this.calls.push(`off ${String(pitch)} @${String(at)}`)
  }
  pedal(pedal: PedalKind, value: number, at: AudioTime): void {
    this.calls.push(`pedal ${pedal} ${String(value)} @${String(at)}`)
  }
  setMasterGain(gain: number): void {
    this.calls.push(`gain ${String(gain)}`)
  }
  stopAll(): void {
    this.calls.push('stop')
  }
  retire(at: AudioTime): void {
    this.retiredAt = at
    this.calls.push(`retire @${String(at)}`)
  }
}

const score: Score = { formatVersion: 1, metadata: { title: 'Etude' } }

describe('EngineSwitch', () => {
  it('passes everything to the engine it holds', async () => {
    const synth = new Recorder('synth')
    const piano = new EngineSwitch(synth)
    await piano.prepare(score)
    piano.noteOn(60, 90, 1)
    piano.noteOff(60, 2)
    expect(piano.kind).toBe('synth')
    expect(synth.calls).toEqual(['prepare Etude', 'on 60 90 @1', 'off 60 @2'])
  })

  it('prepares the new engine for the current score before it takes a note', async () => {
    const synth = new Recorder('synth')
    const sampled = new Recorder('sampled')
    const piano = new EngineSwitch(synth)
    await piano.prepare(score)
    await piano.use(sampled)
    piano.noteOn(64, 80, 3)
    expect(piano.kind).toBe('sampled')
    expect(sampled.calls.slice(0, 1)).toEqual(['prepare Etude'])
    expect(sampled.calls).toContain('on 64 80 @3')
  })

  it('sends a release to the engine that struck the note, across a swap', async () => {
    const synth = new Recorder('synth')
    const sampled = new Recorder('sampled')
    const piano = new EngineSwitch(synth)
    piano.noteOn(60, 90, 1)
    await piano.use(sampled)
    piano.noteOn(64, 90, 1.5)
    piano.noteOff(60, 2)
    piano.noteOff(64, 2.5)
    expect(synth.calls).toEqual(['on 60 90 @1', 'off 60 @2', 'retire @2'])
    expect(sampled.calls.filter((call) => call.startsWith('o'))).toEqual([
      'on 64 90 @1.5',
      'off 64 @2.5',
    ])
  })

  it('retires the old engine at once when no key it struck is down', async () => {
    const synth = new Recorder('synth')
    const piano = new EngineSwitch(synth)
    piano.noteOn(60, 90, 1)
    piano.noteOff(60, 2)
    await piano.use(new Recorder('sampled'))
    expect(synth.retiredAt).toBe(2)
  })

  it('gives the pedals and the master gain to every engine still sounding', async () => {
    const synth = new Recorder('synth')
    const sampled = new Recorder('sampled')
    const piano = new EngineSwitch(synth)
    piano.setMasterGain(0.5)
    piano.pedal('sustain', 127, 0.5)
    piano.noteOn(60, 90, 1)
    await piano.use(sampled)
    piano.pedal('sustain', 0, 3)
    piano.setMasterGain(0.8)

    // The new engine starts with the pedal as it stood and the gain as set.
    expect(sampled.calls.slice(0, 2)).toEqual(['gain 0.5', 'pedal sustain 127 @1'])
    // The old one, still holding middle C, hears the pedal lift.
    expect(synth.calls).toContain('pedal sustain 0 @3')
    expect(synth.calls).toContain('gain 0.8')
  })

  it('stops every engine and retires the ones swapped out', async () => {
    const synth = new Recorder('synth')
    const sampled = new Recorder('sampled')
    const piano = new EngineSwitch(synth)
    piano.noteOn(60, 90, 1)
    await piano.use(sampled)
    piano.stopAll()
    expect(synth.calls).toContain('stop')
    expect(sampled.calls).toContain('stop')
    expect(synth.retiredAt).toBe(1)
    expect(sampled.retiredAt).toBeNull()
  })
})
