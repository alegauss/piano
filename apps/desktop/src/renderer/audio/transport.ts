import {
  ticksToSeconds,
  type PedalKind,
  type ResolvedTiming,
  type Score,
} from '@piano/score-format'

import { beatTicks, meterAt } from './beats'
import type { Clicker } from './clicker'
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
  private timing: ResolvedTiming | null = null
  private metronomeOn = false
  private countInOn = false
  /** When the count-in before this pass ends and the piece begins; null with no count-in. */
  private countInUntil: AudioTime | null = null
  private readonly listeners = new Set<() => void>()

  constructor(
    engine: PianoEngine,
    private readonly clock: Clock,
    ticker?: Ticker,
    /** The metronome's voice; without one there is no metronome and no count-in. */
    private readonly clicker: Clicker | null = null,
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

  get metronome(): boolean {
    return this.metronomeOn
  }

  get countIn(): boolean {
    return this.countInOn
  }

  /**
   * Whether an audio time falls in the count-in before the piece: clicks the
   * player hears and plays nothing to. Whatever grades an attempt asks this
   * first, so the bar before the music is never scored.
   */
  isCountIn(time: AudioTime): boolean {
    return this.countInUntil !== null && time < this.countInUntil
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
    this.timing = performance.timing
    this.countInUntil = null
    this.current = 'stopped'
    this.resumeTick = 0
    this.changed()
  }

  /**
   * Play from where the transport stands, after a bar of count-in when that
   * is on: the meter's beats at the practice tempo, the first one accented,
   * so a player arrives on the first note instead of chasing it.
   */
  play(): void {
    if (this.current === 'playing') {
      return
    }
    let at = this.clock.now() + START_LEAD_SECONDS
    this.countInUntil = null
    const timing = this.timing
    if (this.countInOn && this.clicker !== null && timing !== null) {
      const meter = meterAt(timing, this.resumeTick)
      const beat = beatTicks(meter, timing.ticksPerQuarter)
      const beatSeconds =
        (ticksToSeconds(timing, this.resumeTick + beat) - ticksToSeconds(timing, this.resumeTick)) /
        this.scheduler.tempoScale
      for (let index = 0; index < meter.numerator; index += 1) {
        this.clicker.click(at + index * beatSeconds, index === 0)
      }
      at += meter.numerator * beatSeconds
      this.countInUntil = at
    }
    this.scheduler.start(this.resumeTick, at)
    this.current = 'playing'
    this.changed()
  }

  pause(): void {
    if (this.current !== 'playing') {
      return
    }
    this.resumeTick = this.scheduler.stop()
    this.silenceCountIn()
    this.current = 'paused'
    this.changed()
  }

  /** Stop and go back to the start: of the loop when there is one, of the piece otherwise. */
  stop(): void {
    this.scheduler.stop()
    this.silenceCountIn()
    this.current = 'stopped'
    this.resumeTick = this.scheduler.loop?.start ?? 0
    this.changed()
  }

  /** Move to a tick, carrying on playing from it if playing, with the pedals as they stand there. */
  seek(tick: number): void {
    const target = Math.max(0, tick)
    if (this.current === 'playing') {
      // A seek while playing carries straight on: the count-in is for starting.
      this.scheduler.stop()
      this.silenceCountIn()
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

  /** Click the beats while playing. Off by default: it helps practice and spoils listening. */
  setMetronome(on: boolean): void {
    this.metronomeOn = on && this.clicker !== null
    this.scheduler.setMetronome(this.metronomeOn ? this.clicker : null)
    this.changed()
  }

  /** A bar of clicks before playback starts. Off by default, for the same reason. */
  setCountIn(on: boolean): void {
    this.countInOn = on && this.clicker !== null
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

  /** Cancel a count-in's clicks not yet sounded. */
  private silenceCountIn(): void {
    if (this.countInUntil !== null && this.clock.now() < this.countInUntil) {
      this.clicker?.stopAll()
    }
    this.countInUntil = null
  }

  private changed(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}
