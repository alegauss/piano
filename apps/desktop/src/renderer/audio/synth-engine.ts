import { DEFAULT_TRIM } from '@piano/sample-pack'
import type { Score } from '@piano/score-format'

import {
  pitchToFrequency,
  UNDAMPED_FROM,
  velocityGain,
  type AudioTime,
  type EngineKind,
} from './engine'
import { WebAudioEngine, type VoiceNodes } from './web-audio-engine'

/**
 * The synthesised voice, matched to the recordings it stands in for.
 *
 * A key plays synthesised until its register of recordings arrives, often in
 * the middle of a phrase, so the two have to sound like one instrument in
 * loudness and onset even though they cannot in timbre. The recordings are the
 * reference and this voice is fitted to them, measured by rendering both
 * offline across the keyboard (handover.browser.test.ts repeats it wherever
 * the pack is installed).
 *
 * Loudness: at velocity 50 and 90, from C1 to F#7, the voice was louder than
 * the pack by 14.5 dB at middle C on a least-squares line rising 0.22 dB a
 * semitone, since recordings grow quieter towards the treble; single keys sit
 * a few decibels either side of that line, as recordings do. The velocity
 * curves already agreed, both rising about 31 dB from 20 to 120, so the level
 * is what moved.
 *
 * Onset: the pack keeps a few milliseconds of silence before each hammer, and
 * this voice's attack starts that much after the strike, so the two land
 * together.
 */

/** Loudness of one note at full velocity before the fit: the level it was measured at. */
const VOICE_PEAK = 0.3

/** How much louder than the recordings the voice measured, at middle C. */
const GAP_AT_MIDDLE_C_DB = 14.5

/** How much that grew per semitone upwards. */
const GAP_PER_SEMITONE_DB = 0.22

/** The voice's peak at a pitch, fitted to the recordings. */
export function voicePeak(pitch: number): number {
  const gap = GAP_AT_MIDDLE_C_DB + GAP_PER_SEMITONE_DB * (pitch - 60)
  return VOICE_PEAK * 10 ** (-gap / 20)
}

/** Where a recording's hammer lands after the strike: the silence the pack keeps before it. */
export const ONSET_SECONDS = DEFAULT_TRIM.prerollSeconds

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
  const peak = voicePeak(pitch) * velocityGain(velocity)
  const struck = at + ONSET_SECONDS
  envelope.gain.setValueAtTime(0, at)
  envelope.gain.setValueAtTime(0, struck)
  envelope.gain.linearRampToValueAtTime(peak, struck + ATTACK_SECONDS)
  envelope.gain.setTargetAtTime(0, struck + ATTACK_SECONDS, decaySeconds(pitch))
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
    oscillator.stop(struck + ATTACK_SECONDS + decaySeconds(pitch) * 10)
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
