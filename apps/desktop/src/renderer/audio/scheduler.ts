import {
  pedalValueAt,
  secondsToTicks,
  soundingNote,
  ticksToSeconds,
  type Expression,
  type Note,
  type PedalEvent,
  type PedalKind,
  type ResolvedTiming,
} from '@piano/score-format'

import type { AudioTime, PianoEngine } from './engine'

/**
 * When notes are handed to the engine.
 *
 * A timer per note is late by whatever the main thread was doing when it
 * fired, and a chord whose notes land twenty milliseconds apart sounds broken
 * rather than late. So nothing here is timed by a timer. A wake-up every
 * WAKE_INTERVAL_MS looks LOOK_AHEAD_SECONDS ahead and hands the engine every
 * event falling inside that window, each stamped with its exact time on the
 * audio clock, which runs on the audio thread and does not care what the
 * interface is doing. A wake-up can be late by the look-ahead less the
 * interval before any note is.
 *
 * This is also where ticks become seconds for playback: the tempo map through
 * ticksToSeconds, then the practice tempo scale, in one place. The roll asks
 * the same mapping which tick is sounding, so what is seen and what is heard
 * come from one calculation.
 */

/** How often the scheduler wakes. */
export const WAKE_INTERVAL_MS = 25

/** How far ahead of the clock each wake-up schedules. */
export const LOOK_AHEAD_SECONDS = 0.1

/** A clock in audio time. The app's is the AudioContext's; a test's is a number it moves. */
export type Clock = { now(): AudioTime }

/** Calls back every so often until cancelled. setInterval in the app, a hand-cranked fake in tests. */
export type Ticker = (wake: () => void, intervalMs: number) => () => void

const intervalTicker: Ticker = (wake, intervalMs) => {
  const id = setInterval(wake, intervalMs)
  return () => {
    clearInterval(id)
  }
}

/** What there is to play: the notes as chosen, on the tempo map they are written against. */
export type Performance = {
  readonly timing: ResolvedTiming
  readonly notes: readonly Note[]
  readonly expression?: Expression
}

/** One thing to hand the engine, at a tick. */
export type TimelineEvent =
  | {
      readonly tick: number
      readonly kind: 'off'
      readonly pitch: number
      /** The tick the note was struck at, so a release is never sent for a strike that was skipped. */
      readonly struck: number
    }
  | {
      readonly tick: number
      readonly kind: 'pedal'
      readonly pedal: PedalKind
      readonly value: number
    }
  | {
      readonly tick: number
      readonly kind: 'on'
      readonly pitch: number
      readonly velocity: number
    }

/** Within one tick: releases, then pedals, then strikes, so a repeated key sounds twice. */
const ORDER: Readonly<Record<TimelineEvent['kind'], number>> = { off: 0, pedal: 1, on: 2 }

/**
 * Every event a performance holds, in the order it happens.
 *
 * Notes are taken as they sound, with dynamics and articulation applied by
 * soundingNote, which is the one place those rules live.
 */
export function timelineOf(performance: Performance): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const note of performance.notes) {
    const sounding = soundingNote(note, performance.expression, note.articulation)
    events.push(
      { tick: note.start, kind: 'on', pitch: note.pitch, velocity: sounding.velocity },
      { tick: note.start + sounding.duration, kind: 'off', pitch: note.pitch, struck: note.start },
    )
  }
  for (const event of performance.expression?.pedals ?? []) {
    events.push({ tick: event.tick, kind: 'pedal', pedal: event.pedal, value: event.value })
  }
  return events.sort((a, b) => a.tick - b.tick || ORDER[a.kind] - ORDER[b.kind])
}

/** Where a tick and an audio time were last known to coincide, and how fast they move apart. */
type Anchor = {
  readonly tick: number
  readonly time: AudioTime
  /** The anchor tick in score seconds, before the tempo scale. */
  readonly seconds: number
}

export class Scheduler {
  private timing: ResolvedTiming | null = null
  private events: TimelineEvent[] = []
  private pedals: readonly PedalEvent[] = []
  private cursor = 0
  private anchor: Anchor = { tick: 0, time: 0, seconds: 0 }
  private scale = 1
  /** Where this run began: a note struck before it was never sent, so neither is its release. */
  private fromTick = 0
  /** Everything before this audio time has been handed to the engine. */
  private scheduledUntil: AudioTime = 0
  private started = false
  private cancel: (() => void) | null = null

  constructor(
    private readonly engine: PianoEngine,
    private readonly clock: Clock,
    private readonly ticker: Ticker = intervalTicker,
  ) {}

  /** Replace what is to be played. Stops first, since a timeline cannot change under a cursor. */
  load(performance: Performance): void {
    this.stop()
    this.timing = performance.timing
    this.events = timelineOf(performance)
    this.pedals = performance.expression?.pedals ?? []
  }

  /** Started and not stopped, including the tail after the last event was handed over. */
  get playing(): boolean {
    return this.started
  }

  /** Every event has been handed to the engine: nothing is left to wake for. */
  get finished(): boolean {
    return this.cursor >= this.events.length
  }

  /** The practice tempo, as a multiple of the written one: 0.5 is half speed. */
  get tempoScale(): number {
    return this.scale
  }

  /**
   * Play from a tick, which sounds at `at` on the audio clock.
   *
   * Starting partway through restores the pedals as they stand at that tick,
   * so a passage entered mid-pedal sounds pedalled. A note begun before the
   * tick is not restruck: it was struck before the passage started.
   */
  start(fromTick: number, at: AudioTime = this.clock.now()): void {
    const timing = this.timing
    if (timing === null) {
      return
    }
    this.halt()
    this.started = true
    this.fromTick = fromTick
    this.anchor = { tick: fromTick, time: at, seconds: ticksToSeconds(timing, fromTick) }
    this.cursor = this.events.findIndex((event) => event.tick >= fromTick)
    if (this.cursor === -1) {
      this.cursor = this.events.length
    }
    this.scheduledUntil = at

    const pedals = new Set(this.pedals.map((event) => event.pedal))
    for (const pedal of pedals) {
      const value = pedalValueAt(this.pedals, pedal, fromTick - 1)
      if (value > 0) {
        this.engine.pedal(pedal, value, at)
      }
    }

    this.wake()
    if (!this.finished) {
      this.cancel = this.ticker(() => {
        this.wake()
      }, WAKE_INTERVAL_MS)
    }
  }

  /** Stop and silence, answering the tick that was sounding, which is where a resume starts. */
  stop(): number {
    const now = this.clock.now()
    const tick = this.started ? this.tickAt(now) : this.anchor.tick
    this.halt()
    this.started = false
    if (this.timing !== null) {
      this.anchor = { tick, time: now, seconds: ticksToSeconds(this.timing, tick) }
    }
    this.engine.stopAll()
    return tick
  }

  /**
   * Change the practice tempo while playing, without a jump.
   *
   * What is already handed to the engine keeps its times; the new speed takes
   * over from the end of that window, where the old mapping and the new one
   * agree on the tick.
   */
  setTempoScale(scale: number): void {
    if (!(scale > 0)) {
      return
    }
    if (this.started && this.timing !== null) {
      const tick = this.tickAt(this.scheduledUntil)
      this.anchor = {
        tick,
        time: this.scheduledUntil,
        seconds: ticksToSeconds(this.timing, tick),
      }
    }
    this.scale = scale
  }

  /** The audio time a tick sounds at, under the current tempo scale. */
  timeAt(tick: number): AudioTime {
    if (this.timing === null) {
      return this.anchor.time
    }
    return this.anchor.time + (ticksToSeconds(this.timing, tick) - this.anchor.seconds) / this.scale
  }

  /** The tick sounding at an audio time: what the roll draws and the transport reports. */
  tickAt(time: AudioTime): number {
    if (this.timing === null) {
      return this.anchor.tick
    }
    const seconds = this.anchor.seconds + (time - this.anchor.time) * this.scale
    return Math.max(this.anchor.tick, secondsToTicks(this.timing, seconds))
  }

  private wake(): void {
    const horizon = this.clock.now() + LOOK_AHEAD_SECONDS
    while (this.cursor < this.events.length) {
      const event = this.events[this.cursor]
      if (event === undefined) {
        break
      }
      const at = this.timeAt(event.tick)
      if (at >= horizon) {
        break
      }
      this.hand(event, at)
      this.cursor += 1
    }
    this.scheduledUntil = Math.max(this.scheduledUntil, horizon)
    if (this.finished) {
      this.halt()
    }
  }

  private hand(event: TimelineEvent, at: AudioTime): void {
    switch (event.kind) {
      case 'on':
        this.engine.noteOn(event.pitch, event.velocity, at)
        return
      case 'off':
        if (event.struck >= this.fromTick) {
          this.engine.noteOff(event.pitch, at)
        }
        return
      case 'pedal':
        this.engine.pedal(event.pedal, event.value, at)
        return
    }
  }

  private halt(): void {
    this.cancel?.()
    this.cancel = null
  }
}
