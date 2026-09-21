import type { PedalKind, Score } from '@piano/score-format'

import { type AudioTime, type EngineKind, type PianoEngine } from './engine'
import { Keyboard, type Voice } from './keyboard'

/** What an engine builds for one note: the nodes that sound it and how fast it dies on release. */
export type VoiceNodes = {
  /** Every source feeding the envelope; they stop together. */
  readonly sources: readonly AudioScheduledSourceNode[]
  /** The gain the release shapes. */
  readonly envelope: GainNode
  /** Time constant of the release, in seconds: about a fifth of the audible tail. */
  readonly releaseSeconds: number
}

/** A stop that does not click: fast, but a fade rather than a cut. */
const STOP_SECONDS = 0.005

/** How many time constants a release runs before its sources stop: well under -60 dB. */
const RELEASE_TAIL = 8

/**
 * The half every Web Audio engine shares.
 *
 * Output chain, master gain, the keyboard's rules and the bookkeeping that
 * lets a retired engine let go of its output once its last note has died.
 * A subclass says only how one note is made, which is the one thing a
 * synthesiser and a sampler actually disagree about.
 */
export abstract class WebAudioEngine implements PianoEngine {
  abstract readonly kind: EngineKind

  private readonly output: GainNode
  private readonly limiter: DynamicsCompressorNode
  private readonly keyboard: Keyboard
  private retired = false
  private sounding = 0

  constructor(
    protected readonly context: BaseAudioContext,
    destination: AudioNode = context.destination,
  ) {
    this.output = context.createGain()
    // A limiter rather than a lower gain per note: ten notes of a chord add
    // up, and quietening every note to survive the chord would make a single
    // note too quiet to hear.
    this.limiter = context.createDynamicsCompressor()
    this.limiter.threshold.value = -3
    this.limiter.knee.value = 0
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.003
    this.limiter.release.value = 0.25
    this.output.connect(this.limiter).connect(destination)
    this.keyboard = new Keyboard((pitch, velocity, at) => this.startVoice(pitch, velocity, at))
  }

  abstract prepare(score: Score): Promise<void>

  /** Build the nodes for one note, starting at `at`, feeding `into`; null when this engine cannot play it. */
  protected abstract voice(
    pitch: number,
    velocity: number,
    at: AudioTime,
    into: AudioNode,
  ): VoiceNodes | null

  noteOn(pitch: number, velocity: number, at: AudioTime): void {
    if (!this.retired) {
      this.keyboard.noteOn(pitch, velocity, at)
    }
  }

  noteOff(pitch: number, at: AudioTime): void {
    this.keyboard.noteOff(pitch, at)
  }

  pedal(pedal: PedalKind, value: number, at: AudioTime): void {
    this.keyboard.pedal(pedal, value, at)
  }

  setMasterGain(gain: number): void {
    const clamped = Math.min(1, Math.max(0, gain))
    this.output.gain.setTargetAtTime(clamped, this.context.currentTime, 0.015)
  }

  stopAll(): void {
    this.keyboard.stopAll()
  }

  retire(at: AudioTime): void {
    this.retired = true
    this.keyboard.releaseAll(Math.max(at, this.context.currentTime))
    this.letGoIfSilent()
  }

  private startVoice(pitch: number, velocity: number, at: AudioTime): Voice | null {
    const nodes = this.voice(pitch, velocity, at, this.output)
    if (nodes === null) {
      return null
    }
    const { sources, envelope, releaseSeconds } = nodes
    const [first] = sources
    this.sounding += 1
    if (first !== undefined) {
      first.onended = () => {
        this.sounding -= 1
        envelope.disconnect()
        this.letGoIfSilent()
      }
    }

    const gain = envelope.gain
    return {
      release: (when) => {
        const from = Math.max(when, this.context.currentTime)
        gain.cancelAndHoldAtTime(from)
        gain.setTargetAtTime(0, from, releaseSeconds)
        for (const source of sources) {
          source.stop(from + releaseSeconds * RELEASE_TAIL)
        }
      },
      stop: () => {
        const now = this.context.currentTime
        gain.cancelScheduledValues(now)
        gain.setTargetAtTime(0, now, STOP_SECONDS)
        for (const source of sources) {
          source.stop(now + STOP_SECONDS * RELEASE_TAIL)
        }
      },
    }
  }

  private letGoIfSilent(): void {
    if (this.retired && this.sounding === 0) {
      this.limiter.disconnect()
    }
  }
}
