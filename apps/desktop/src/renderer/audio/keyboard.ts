import type { PedalKind } from '@piano/score-format'

import { PEDAL_DOWN, type AudioTime } from './engine'

/**
 * Which strings are sounding, and what the keys and pedals say should happen
 * to them.
 *
 * This is the part of a piano that is rules rather than sound: a released key
 * keeps sounding while the sustain pedal is down, the sostenuto holds only the
 * keys that were down when it was pressed, and a key struck again damps what
 * its string was still sounding. Both engines share it, so they cannot
 * disagree about pedalling, and it touches no audio node, so it is tested
 * without a sound card.
 *
 * Events are expected in time order, which is the scheduler's promise.
 */

/** One sounding note, as an engine made it. */
export type Voice = {
  /** Let it die away from `at`, as a released key does. */
  release(at: AudioTime): void
  /** Silence it at once, for a stop or a seek. */
  stop(): void
}

/** Make a voice, or answer null when this engine has nothing to play the pitch with. */
export type StartVoice = (pitch: number, velocity: number, at: AudioTime) => Voice | null

/** How much the soft pedal takes off a note struck while it is down. */
export const SOFT_PEDAL_SCALE = 0.7

type Strike = {
  readonly pitch: number
  readonly voice: Voice | null
  /** The key has not been let up. A key's release is paired with its strike, oldest first. */
  keyDown: boolean
  /** Not yet released or damped. */
  sounding: boolean
  /** The sostenuto caught this key down and holds it. */
  heldBySostenuto: boolean
}

export class Keyboard {
  private strikes: Strike[] = []
  private sustain = false
  private sostenuto = false
  private soft = false

  constructor(private readonly start: StartVoice) {}

  noteOn(pitch: number, velocity: number, at: AudioTime): void {
    // A key struck again damps what its string was still sounding. The old
    // strike stays on the books until its own key comes up, so that release
    // is not mistaken for the new note's.
    for (const strike of this.strikes) {
      if (strike.pitch === pitch && strike.sounding) {
        this.silence(strike, at)
      }
    }
    const struck = this.soft ? Math.max(1, Math.round(velocity * SOFT_PEDAL_SCALE)) : velocity
    const voice = this.start(pitch, struck, at)
    this.strikes.push({
      pitch,
      voice,
      keyDown: true,
      sounding: voice !== null,
      heldBySostenuto: false,
    })
  }

  noteOff(pitch: number, at: AudioTime): void {
    const strike = this.strikes.find((candidate) => candidate.pitch === pitch && candidate.keyDown)
    if (strike === undefined) {
      return
    }
    strike.keyDown = false
    if (strike.sounding && (this.sustain || strike.heldBySostenuto)) {
      return
    }
    this.silence(strike, at)
  }

  pedal(pedal: PedalKind, value: number, at: AudioTime): void {
    const down = value >= PEDAL_DOWN

    switch (pedal) {
      case 'sustain':
        this.sustain = down
        if (!down) {
          for (const strike of this.strikes.filter((s) => !s.keyDown && !s.heldBySostenuto)) {
            this.silence(strike, at)
          }
        }
        return
      case 'sostenuto':
        if (down && !this.sostenuto) {
          for (const strike of this.strikes) {
            strike.heldBySostenuto = strike.keyDown && strike.sounding
          }
        } else if (!down && this.sostenuto) {
          for (const strike of this.strikes.filter((s) => s.heldBySostenuto)) {
            strike.heldBySostenuto = false
            if (!strike.keyDown && !this.sustain) {
              this.silence(strike, at)
            }
          }
        }
        this.sostenuto = down
        return
      case 'softUnaCorda':
        this.soft = down
        return
    }
  }

  /** Release everything still sounding at `at`, as if every key and pedal came up. */
  releaseAll(at: AudioTime): void {
    for (const strike of this.strikes) {
      if (strike.sounding) {
        strike.voice?.release(at)
      }
    }
    this.reset()
  }

  /** Silence everything at once. */
  stopAll(): void {
    for (const strike of this.strikes) {
      if (strike.sounding) {
        strike.voice?.stop()
      }
    }
    this.reset()
  }

  /** How many strings are still sounding, for a test or a meter. */
  get soundingCount(): number {
    return this.strikes.filter((strike) => strike.sounding).length
  }

  private silence(strike: Strike, at: AudioTime): void {
    if (strike.sounding) {
      strike.voice?.release(at)
      strike.sounding = false
    }
    if (!strike.keyDown) {
      this.strikes = this.strikes.filter((other) => other !== strike)
    }
  }

  private reset(): void {
    this.strikes = []
    this.sustain = false
    this.sostenuto = false
    this.soft = false
  }
}
