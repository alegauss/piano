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
 * The sustain pedal is a range, not a switch, because the format stores one:
 * half down, the dampers brush the strings, and a released note fades faster
 * than with the pedal down and slower than with it up.
 *
 * Events are expected in time order, which is the scheduler's promise.
 */

/** One sounding note, as an engine made it. */
export type Voice = {
  /** Let it die away from `at`, as a released key does. */
  release(at: AudioTime): void
  /**
   * Press the damper on the string from `at` by `amount`, from 0 (lifted:
   * the string rings as it would) to 1 (down: which is `release`).
   */
  damp(at: AudioTime, amount: number): void
  /** Silence it at once, for a stop or a seek. */
  stop(): void
  /** A string with no damper, as the top of a piano has: letting the key up does not stop it. */
  readonly undamped?: boolean
}

/** Make a voice, or answer null when this engine has nothing to play the pitch with. */
export type StartVoice = (pitch: number, velocity: number, at: AudioTime) => Voice | null

/** How much the soft pedal takes off a note struck while it is down. */
export const SOFT_PEDAL_SCALE = 0.7

/** Sustain values at or above this lift the dampers clear of the strings. */
export const SUSTAIN_CLEAR = 96

/** Sustain values at or below this leave the dampers resting on the strings. */
export const SUSTAIN_RESTING = 32

/**
 * How hard the dampers press on the strings at a sustain value: 0 lifted, 1
 * resting, and in between the half-pedal a pianist uses to thin a sound
 * without cutting it.
 */
export function damperAmount(sustain: number): number {
  if (sustain >= SUSTAIN_CLEAR) {
    return 0
  }
  if (sustain <= SUSTAIN_RESTING) {
    return 1
  }
  return (SUSTAIN_CLEAR - sustain) / (SUSTAIN_CLEAR - SUSTAIN_RESTING)
}

type Strike = {
  readonly pitch: number
  readonly voice: Voice | null
  /** The key has not been let up. A key's release is paired with its strike, oldest first. */
  keyDown: boolean
  /** Not yet released or damped. */
  sounding: boolean
  /** The sostenuto caught this key down and holds it. */
  heldBySostenuto: boolean
  /** How hard the damper presses now: 0 while the key is down. */
  damper: number
}

export class Keyboard {
  private strikes: Strike[] = []
  private sustain = 0
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
      damper: 0,
    })
  }

  noteOff(pitch: number, at: AudioTime): void {
    const strike = this.strikes.find((candidate) => candidate.pitch === pitch && candidate.keyDown)
    if (strike === undefined) {
      return
    }
    strike.keyDown = false
    if (!strike.sounding) {
      this.forget(strike)
      return
    }
    this.applyDamper(strike, at)
  }

  pedal(pedal: PedalKind, value: number, at: AudioTime): void {
    const down = value >= PEDAL_DOWN

    switch (pedal) {
      case 'sustain':
        if (value === this.sustain) {
          return
        }
        this.sustain = value
        for (const strike of this.strikes.filter((s) => s.sounding && !s.keyDown)) {
          this.applyDamper(strike, at)
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
            if (!strike.keyDown) {
              this.applyDamper(strike, at)
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

  /**
   * Set the damper on a released key's string to what the pedals say: none
   * while the sostenuto holds it or the string has no damper, otherwise as
   * far as the sustain pedal lets it fall.
   */
  private applyDamper(strike: Strike, at: AudioTime): void {
    if (strike.heldBySostenuto || strike.voice?.undamped === true) {
      return
    }
    const amount = damperAmount(this.sustain)
    if (amount >= 1) {
      this.silence(strike, at)
    } else if (amount !== strike.damper) {
      strike.voice?.damp(at, amount)
      strike.damper = amount
    }
  }

  private silence(strike: Strike, at: AudioTime): void {
    if (strike.sounding) {
      strike.voice?.release(at)
      strike.sounding = false
    }
    if (!strike.keyDown) {
      this.forget(strike)
    }
  }

  private forget(strike: Strike): void {
    this.strikes = this.strikes.filter((other) => other !== strike)
  }

  private reset(): void {
    this.strikes = []
    this.sustain = 0
    this.sostenuto = false
    this.soft = false
  }
}
