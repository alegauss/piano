import type { PedalKind, Score } from '@piano/score-format'

import type { AudioTime, EngineKind, PianoEngine } from './engine'
import { Scheduler, type Clock, type LoopRange, type Performance, type Ticker } from './scheduler'

/**
 * Play, pause, stop, seek, loop, tempo and transpose: the one state machine
 * everything else reads.
 *
 * It keeps no clock of its own. Where playback is comes from the audio clock
 * through the scheduler's mapping, the same mapping that timed the notes, so
 * the position the roll draws is the position that is sounding. Every
 * operation is in ticks, which is what lets them compose: seeking to a bar,
 * looping a section and slowing to 60 percent are the same few numbers
 * whichever order they arrive in.
 */

export type TransportStatus = 'stopped' | 'playing' | 'paused'

/** How far ahead of the clock playback starts, so the first notes are not late for their own start. */
export const START_LEAD_SECONDS = 0.05

/** The widest transposition offered: two octaves either way. */
export const MAX_TRANSPOSE = 24

/**
 * Every note moved by some semitones at the engine's door.
 *
 * Done here, rather than in the score, so the score and the roll keep what is
 * written. A note is released at the pitch it was struck at, so changing the
 * transposition while a chord sounds cannot strand it.
 */
export class Transposer implements PianoEngine {
  semitones = 0
  /** Per written pitch, the pitches it was struck at, oldest first. */
  private readonly struck = new Map<number, number[]>()

  constructor(private readonly engine: PianoEngine) {}

  get kind(): EngineKind {
    return this.engine.kind
  }

  prepare(score: Score): Promise<void> {
    return this.engine.prepare(score)
  }

  noteOn(pitch: number, velocity: number, at: AudioTime): void {
    const shifted = Math.min(127, Math.max(0, pitch + this.semitones))
    const held = this.struck.get(pitch)
    if (held === undefined) {
      this.struck.set(pitch, [shifted])
    } else {
      held.push(shifted)
    }
    this.engine.noteOn(shifted, velocity, at)
  }

  noteOff(pitch: number, at: AudioTime): void {
    const shifted =
      this.struck.get(pitch)?.shift() ?? Math.min(127, Math.max(0, pitch + this.semitones))
    this.engine.noteOff(shifted, at)
  }

  pedal(pedal: PedalKind, value: number, at: AudioTime): void {
    this.engine.pedal(pedal, value, at)
  }

  setMasterGain(gain: number): void {
    this.engine.setMasterGain(gain)
  }

  stopAll(): void {
    this.struck.clear()
    this.engine.stopAll()
  }

  retire(at: AudioTime): void {
    this.engine.retire(at)
  }
}

export class Transport {
  private readonly scheduler: Scheduler
  private readonly transposer: Transposer
  private current: TransportStatus = 'stopped'
  /** Where playback resumes from while it is not playing. */
  private resumeTick = 0
  private readonly listeners = new Set<() => void>()

  constructor(
    engine: PianoEngine,
    private readonly clock: Clock,
    ticker?: Ticker,
  ) {
    this.transposer = new Transposer(engine)
    this.scheduler = new Scheduler(this.transposer, clock, ticker, () => {
      this.finish()
    })
  }

  get status(): TransportStatus {
    return this.current
  }

  get tempoScale(): number {
    return this.scheduler.tempoScale
  }

  get transpose(): number {
    return this.transposer.semitones
  }

  get loop(): LoopRange | null {
    return this.scheduler.loop
  }

  /** The tick sounding now: read from the audio clock while playing, held while not. */
  position(): number {
    return this.current === 'playing' ? this.scheduler.tickAt(this.clock.now()) : this.resumeTick
  }

  /** The tick sounding at any audio time, for a view that draws ahead of or behind the clock. */
  tickAt(time: AudioTime): number {
    return this.current === 'playing' ? this.scheduler.tickAt(time) : this.resumeTick
  }

  /** Replace the piece. Stops, and puts the position back to the start. */
  load(performance: Performance): void {
    this.scheduler.load(performance)
    this.current = 'stopped'
    this.resumeTick = 0
    this.changed()
  }

  play(): void {
    if (this.current === 'playing') {
      return
    }
    this.scheduler.start(this.resumeTick, this.clock.now() + START_LEAD_SECONDS)
    this.current = 'playing'
    this.changed()
  }

  pause(): void {
    if (this.current !== 'playing') {
      return
    }
    this.resumeTick = this.scheduler.stop()
    this.current = 'paused'
    this.changed()
  }

  /** Stop and go back to the start: of the loop when there is one, of the piece otherwise. */
  stop(): void {
    this.scheduler.stop()
    this.current = 'stopped'
    this.resumeTick = this.scheduler.loop?.start ?? 0
    this.changed()
  }

  /** Move to a tick, carrying on playing from it if playing, with the pedals as they stand there. */
  seek(tick: number): void {
    const target = Math.max(0, tick)
    if (this.current === 'playing') {
      this.scheduler.stop()
      this.scheduler.start(target, this.clock.now() + START_LEAD_SECONDS)
    } else {
      this.resumeTick = target
    }
    this.changed()
  }

  /** Repeat a stretch, or stop repeating; it takes hold when playing crosses its end. */
  setLoop(range: LoopRange | null): void {
    this.scheduler.setLoop(range)
    this.changed()
  }

  /** The practice tempo, as a multiple of the written one. Changes while playing without a jump. */
  setTempoScale(scale: number): void {
    this.scheduler.setTempoScale(scale)
    this.changed()
  }

  /** Semitones up or down, from the next note struck. */
  setTranspose(semitones: number): void {
    this.transposer.semitones = Math.max(
      -MAX_TRANSPOSE,
      Math.min(MAX_TRANSPOSE, Math.round(semitones)),
    )
    this.changed()
  }

  /** For a view, told whenever the status, loop, tempo or transposition changes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * The last note has been struck and released and nothing loops: back to
   * the start, stopped. The engine is left alone, so the last chord and any
   * pedalled tail ring out rather than being cut.
   */
  private finish(): void {
    this.current = 'stopped'
    this.resumeTick = 0
    this.changed()
  }

  private changed(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}
