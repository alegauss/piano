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
  /** Recorded on a string with no damper, which rings on after the key comes up. */
  readonly undamped?: boolean
}

/** A recording to play for a note, at a gain: two of them near a velocity layer's edge. */
export type SoundingSample = {
  readonly sample: Sample
  readonly gain: number
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
 * pack pipeline decides the files, the bank decides when they load and which
 * velocity layers a note sounds. The engine only asks what to play.
 */
export interface SampleBank {
  /** Make sure what these pitches need is loaded. */
  load(pitches: ReadonlySet<number>): Promise<void>
  /** The loaded recordings to play a note from, with their gains; none when nothing covers it yet. */
  samplesFor(pitch: number, velocity: number): readonly SoundingSample[]
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
    samplesFor: (pitch) => {
      let best: Sample | null = null
      for (const sample of samples) {
        const distance = Math.abs(sample.pitch - pitch)
        const bestDistance = best === null ? Infinity : Math.abs(best.pitch - pitch)
        if (distance < bestDistance || (distance === bestDistance && sample.pitch < pitch)) {
          best = sample
        }
      }
      return best === null ? [] : [{ sample: best, gain: 1 }]
    },
  }
}

/** Loudness of a sample at full velocity: recordings arrive normalised near full scale. */
const VOICE_PEAK = 0.5

/**
 * How much of the velocity curve applies on top of the layer.
 *
 * The layer already sounds soft or loud, since it was recorded that way, so
 * applying the whole curve again would count the dynamics twice. The library's
 * own mapping tracks velocity at 73 percent, and this follows it.
 */
const VELOCITY_TRACKING = 0.73

/**
 * A piano made of recordings.
 *
 * The real product. Velocity chooses the recording: a soft note is a softer
 * recording, not the loud one turned down, and near a layer's edge the two
 * neighbours crossfade. Each is retuned by playback rate to the key asked for;
 * the decay is whatever the recording holds, and the keyboard's rules decide
 * when the damper falls.
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
    const layers = this.bank.samplesFor(pitch, velocity)
    if (layers.length === 0) {
      return this.fallback ? synthVoice(context, pitch, velocity, at, into) : null
    }

    const envelope = context.createGain()
    envelope.gain.setValueAtTime(VOICE_PEAK * velocityGain(velocity) ** VELOCITY_TRACKING, at)
    envelope.connect(into)

    const sources = layers.map(({ sample, gain }) => {
      const source = context.createBufferSource()
      source.buffer = sample.buffer
      const semitones = pitch - sample.pitch + (sample.tuneCents ?? 0) / 100
      source.playbackRate.value = 2 ** (semitones / 12)
      const layer = context.createGain()
      layer.gain.value = gain
      source.connect(layer).connect(envelope)
      source.start(at)
      return source
    })

    const undamped = layers.some(({ sample }) => sample.undamped === true)
    return {
      sources,
      envelope,
      releaseSeconds: 0.12,
      ...(undamped ? { undamped: true } : {}),
    }
  }
}
