import type { PedalKind, Score } from '@piano/score-format'

/**
 * The seam between deciding what to sound and making the sound.
 *
 * Everything above it, meaning the transport, the roll, the practice grader
 * and the MCP tools, deals in notes and times, never in oscillators and
 * buffers. Nothing outside this folder may touch a Web Audio node; the lint
 * config refuses it. That is what lets a synthesised engine and a sampled one
 * swap under a playing score without the code driving them knowing.
 *
 * Times are absolute, in seconds on the audio clock, rather than delays from
 * now. A delay is measured from a moment the caller cannot pin down, and that
 * reintroduces the drift a look-ahead scheduler exists to remove; an absolute
 * time is the one thing the scheduler can hand over exactly. It is also the
 * decision here that would be most expensive to reverse.
 */

/** Seconds on the audio clock, the same clock every engine behind one switch shares. */
export type AudioTime = number

export type EngineKind = 'synth' | 'sampled'

export interface PianoEngine {
  readonly kind: EngineKind
  /** Get ready to play a score, loading whatever its notes need. Resolves when it can play them. */
  prepare(score: Score): Promise<void>
  /** Strike a key. Velocity is 1 to 127, as the score stores it. */
  noteOn(pitch: number, velocity: number, at: AudioTime): void
  /** Let a key up. With the sustain pedal down the string keeps sounding. */
  noteOff(pitch: number, at: AudioTime): void
  /** Move a pedal, 0 to 127 as the score stores it. */
  pedal(pedal: PedalKind, value: number, at: AudioTime): void
  /** Overall loudness, 0 to 1, applied smoothly so a change never clicks. */
  setMasterGain(gain: number): void
  /** Silence everything now and put the pedals up: a stop or a seek, not a release. */
  stopAll(): void
  /**
   * Take no more notes, let everything still sounding end from `at`, and let
   * go of the output once it has. What an engine being swapped out does.
   */
  retire(at: AudioTime): void
}

/** How far a pedal must go down to count as down, until PI22 models half-pedalling. */
export const PEDAL_DOWN = 64

/**
 * How loud a velocity is, as a gain from 0 to 1.
 *
 * Squared rather than linear, because a velocity is about how hard the key
 * was struck and loudness grows faster than that: linear makes a pianissimo
 * barely softer than a forte.
 */
export function velocityGain(velocity: number): number {
  const clamped = Math.min(127, Math.max(1, velocity))
  return (clamped / 127) ** 2
}

/** Equal temperament at A4 = 440 Hz. */
export function pitchToFrequency(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12)
}
