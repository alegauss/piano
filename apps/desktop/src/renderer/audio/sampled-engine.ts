import { notesOf, type Score } from '@piano/score-format'

import { velocityGain, type AudioTime, type EngineKind } from './engine'
import { synthVoice } from './synth-engine'
import { WebAudioEngine, type VoiceNodes } from './web-audio-engine'

/** One recording of one key, and the pitch it was recorded at. */
export type Sample = {
  readonly pitch: number
  readonly buffer: AudioBuffer
  /** A tuning correction the library states for this recording, in cents. */
  readonly tuneCents?: number
}

export type SampledEngineOptions = {
  readonly destination?: AudioNode
  /**
   * Play a synthesised note for any key the bank has no recording for yet,
   * rather than nothing: the engine then takes over key by key as the
   * recordings arrive instead of waiting for all of them.
   */
  readonly fallback?: boolean
}

/**
 * Where a sampled engine gets its recordings.
 *
 * An interface because where they come from is somebody else's problem: the
 * pack pipeline (PI20) decides the files, lazy loading by register (PI21)
 * decides when, and velocity layers (PI22) decide which of several. The engine
 * only asks for the recording to play a pitch from.
 */
export interface SampleBank {
  /** Make sure what these pitches need is loaded. */
  load(pitches: ReadonlySet<number>): Promise<void>
  /** The loaded recording to play a pitch from, or null when none covers it yet. */
  sampleFor(pitch: number, velocity: number): Sample | null
}

/**
 * A bank already in memory, answering with the nearest recording.
 *
 * Nearest, and the lower of two equally near, because a recording shifted up
 * a semitone or two is the standard way to cover the keys between samples.
 */
export function bankOf(samples: readonly Sample[]): SampleBank {
  return {
    load: () => Promise.resolve(),
    sampleFor: (pitch) => {
      let best: Sample | null = null
      for (const sample of samples) {
        const distance = Math.abs(sample.pitch - pitch)
        const bestDistance = best === null ? Infinity : Math.abs(best.pitch - pitch)
        if (distance < bestDistance || (distance === bestDistance && sample.pitch < pitch)) {
          best = sample
        }
      }
      return best
    },
  }
}

/** Loudness of a sample at full velocity: recordings arrive normalised near full scale. */
const VOICE_PEAK = 0.5

/**
 * A piano made of recordings.
 *
 * The real product. Each note plays the nearest recording, retuned by
 * playback rate, at a gain from its velocity; the decay is whatever the
 * recording holds, and the keyboard's rules decide when it is released.
 */
export class SampledEngine extends WebAudioEngine {
  readonly kind: EngineKind = 'sampled'

  private readonly fallback: boolean

  constructor(
    context: BaseAudioContext,
    private readonly bank: SampleBank,
    options: SampledEngineOptions = {},
  ) {
    super(context, options.destination)
    this.fallback = options.fallback ?? false
  }

  /**
   * Load what the score needs. With a fallback the engine can already play
   * all of it, so it is ready at once and the recordings arrive behind it.
   */
  prepare(score: Score): Promise<void> {
    const loading = this.bank.load(new Set(notesOf(score).map((note) => note.pitch)))
    if (this.fallback) {
      loading.catch(() => {})
      return Promise.resolve()
    }
    return loading
  }

  protected voice(
    pitch: number,
    velocity: number,
    at: AudioTime,
    into: AudioNode,
  ): VoiceNodes | null {
    const { context } = this
    const sample = this.bank.sampleFor(pitch, velocity)
    if (sample === null) {
      return this.fallback ? synthVoice(context, pitch, velocity, at, into) : null
    }
    const source = context.createBufferSource()
    source.buffer = sample.buffer
    const semitones = pitch - sample.pitch + (sample.tuneCents ?? 0) / 100
    source.playbackRate.value = 2 ** (semitones / 12)

    const envelope = context.createGain()
    envelope.gain.setValueAtTime(VOICE_PEAK * velocityGain(velocity), at)
    source.connect(envelope).connect(into)
    source.start(at)

    return { sources: [source], envelope, releaseSeconds: 0.12 }
  }
}
