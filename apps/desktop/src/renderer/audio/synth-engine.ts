import type { Score } from '@piano/score-format'

import {
  pitchToFrequency,
  UNDAMPED_FROM,
  velocityGain,
  type AudioTime,
  type EngineKind,
} from './engine'
import { WebAudioEngine, type VoiceNodes } from './web-audio-engine'

/** Loudness of one note at full velocity, leaving room for a chord before the limiter works. */
const VOICE_PEAK = 0.3

const ATTACK_SECONDS = 0.004

/** Partials above the fundamental, as multiples and levels: enough to read as a struck string. */
const PARTIALS: readonly { multiple: number; type: OscillatorType; level: number }[] = [
  { multiple: 1, type: 'triangle', level: 1 },
  { multiple: 2, type: 'sine', level: 0.25 },
  { multiple: 3, type: 'sine', level: 0.08 },
]

const LOWEST = 21
const HIGHEST = 108

/**
 * How long a note takes to fade while held, as a time constant: three seconds
 * at the bottom of the keyboard, under half a second at the top, the way a
 * long bass string rings on after a short treble one has gone.
 */
function decaySeconds(pitch: number): number {
  const height = Math.min(1, Math.max(0, (pitch - LOWEST) / (HIGHEST - LOWEST)))
  return 3 - 2.6 * height
}

/**
 * One synthesised note: three partials under a struck-string envelope.
 *
 * A function rather than a method, because the sampled engine plays it too,
 * for any key whose recordings have not arrived yet.
 */
export function synthVoice(
  context: BaseAudioContext,
  pitch: number,
  velocity: number,
  at: AudioTime,
  into: AudioNode,
): VoiceNodes {
  const frequency = pitchToFrequency(pitch)
  const envelope = context.createGain()
  const peak = VOICE_PEAK * velocityGain(velocity)
  envelope.gain.setValueAtTime(0, at)
  envelope.gain.linearRampToValueAtTime(peak, at + ATTACK_SECONDS)
  envelope.gain.setTargetAtTime(0, at + ATTACK_SECONDS, decaySeconds(pitch))
  envelope.connect(into)

  const sources = PARTIALS.map(({ multiple, type, level }) => {
    const oscillator = context.createOscillator()
    oscillator.type = type
    oscillator.frequency.value = frequency * multiple
    const partial = context.createGain()
    partial.gain.value = level
    oscillator.connect(partial).connect(envelope)
    oscillator.start(at)
    // Whatever the pedals do, the string has died by then; without this an
    // undamped or pedalled note would keep its oscillators running for good.
    oscillator.stop(at + ATTACK_SECONDS + decaySeconds(pitch) * 10)
    return oscillator
  })

  return {
    sources,
    envelope,
    releaseSeconds: 0.08,
    ringSeconds: decaySeconds(pitch),
    ...(pitch >= UNDAMPED_FROM ? { undamped: true } : {}),
  }
}

/**
 * A piano made of oscillators.
 *
 * Small, always available and needing nothing loaded, which is why it exists
 * beside the sampled engine: it is what plays while samples are still
 * arriving, and what the audio tests run against, because a test that needs
 * a sample pack and an output device is a test nobody runs.
 */
export class SynthEngine extends WebAudioEngine {
  readonly kind: EngineKind = 'synth'

  prepare(_score: Score): Promise<void> {
    return Promise.resolve()
  }

  protected voice(pitch: number, velocity: number, at: AudioTime, into: AudioNode): VoiceNodes {
    return synthVoice(this.context, pitch, velocity, at, into)
  }
}
