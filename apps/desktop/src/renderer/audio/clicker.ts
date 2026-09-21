import type { AudioTime } from './engine'

/**
 * The metronome's voice: a click, and a brighter one on the downbeat.
 *
 * Not a piano engine, because a click is not a note: it has no pitch the
 * score cares about, no pedal and no release. It gets its own output and its
 * own gain, so it stays audible against a loud passage instead of going
 * through the piano's limiter with everything else.
 */
export interface Clicker {
  click(at: AudioTime, accent: boolean): void
  /** Silence every click scheduled and not yet sounded: a pause or a seek. */
  stopAll(): void
}

const ACCENT_HZ = 1760
const BEAT_HZ = 1320
const CLICK_SECONDS = 0.05

export class WebAudioClicker implements Clicker {
  private readonly output: GainNode
  private readonly pending = new Set<OscillatorNode>()

  constructor(
    private readonly context: BaseAudioContext,
    destination: AudioNode = context.destination,
  ) {
    this.output = context.createGain()
    this.output.gain.value = 0.4
    this.output.connect(destination)
  }

  /** The metronome's own loudness, 0 to 1, apart from the piano's. */
  setGain(gain: number): void {
    this.output.gain.setTargetAtTime(
      Math.min(1, Math.max(0, gain)),
      this.context.currentTime,
      0.015,
    )
  }

  click(at: AudioTime, accent: boolean): void {
    const { context } = this
    const oscillator = context.createOscillator()
    oscillator.frequency.value = accent ? ACCENT_HZ : BEAT_HZ
    const envelope = context.createGain()
    const peak = accent ? 1 : 0.6
    envelope.gain.setValueAtTime(0, at)
    envelope.gain.linearRampToValueAtTime(peak, at + 0.001)
    envelope.gain.setTargetAtTime(0, at + 0.001, 0.012)
    oscillator.connect(envelope).connect(this.output)
    oscillator.start(at)
    oscillator.stop(at + CLICK_SECONDS)
    this.pending.add(oscillator)
    oscillator.onended = () => {
      this.pending.delete(oscillator)
      envelope.disconnect()
    }
  }

  stopAll(): void {
    const now = this.context.currentTime
    for (const oscillator of this.pending) {
      oscillator.stop(now)
    }
  }
}
