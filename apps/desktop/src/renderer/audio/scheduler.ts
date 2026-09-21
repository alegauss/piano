import {
  noteAudible,
  pedalValueAt,
  secondsToTicks,
  soundingNote,
  ticksToSeconds,
  type Expression,
  type Hand,
  type Note,
  type PedalEvent,
  type PedalKind,
  type PlaybackFilter,
  type ResolvedTiming,
} from '@piano/score-format'

import { beatsBetween } from './beats'
import type { Clicker } from './clicker'
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
      readonly kind: 'on'
      readonly pitch: number
      readonly velocity: number
      /** Who plays it, so a mute or a solo can be answered per note as it is handed over. */
      readonly part?: string
      readonly hand?: Hand
      readonly voice?: number
    }
  | {
      readonly tick: number
      readonly kind: 'pedal'
      readonly pedal: PedalKind
      readonly value: number
    }
  | { readonly tick: number; readonly kind: 'click'; readonly accent: boolean }

/** Within one tick: releases, then pedals, then strikes, so a repeated key sounds twice. */
const ORDER: Readonly<Record<TimelineEvent['kind'], number>> = {
  off: 0,
  click: 1,
  pedal: 2,
  on: 3,
}

/**
 * Every event a performance holds, in the order it happens.
 *
 * Notes are taken as they sound, with dynamics and articulation applied by
 * soundingNote, which is the one place those rules live. With `beats`, the
 * metronome's clicks too, from the time signature map up to the last note,
 * so a loop, a seek and a tempo change carry them exactly as they carry the
 * notes.
 */
export function timelineOf(
  performance: Performance,
  options: { readonly beats?: boolean } = {},
): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const note of performance.notes) {
    const sounding = soundingNote(note, performance.expression, note.articulation)
    events.push(
      {
        tick: note.start,
        kind: 'on',
        pitch: note.pitch,
        velocity: sounding.velocity,
        part: note.part,
        hand: note.hand,
        voice: note.voice,
      },
      { tick: note.start + sounding.duration, kind: 'off', pitch: note.pitch, struck: note.start },
    )
  }
  for (const event of performance.expression?.pedals ?? []) {
    events.push({ tick: event.tick, kind: 'pedal', pedal: event.pedal, value: event.value })
  }
  if (options.beats === true && events.length > 0) {
    const last = Math.max(...events.map((event) => event.tick))
    for (const beat of beatsBetween(performance.timing, 0, last)) {
      events.push({ tick: beat.tick, kind: 'click', accent: beat.accent })
    }
  }
  return events.sort((a, b) => a.tick - b.tick || ORDER[a.kind] - ORDER[b.kind])
}

/** Where a tick and an audio time coincide, and how fast they move apart from there. */
type Anchor = {
  readonly tick: number
  readonly time: AudioTime
  /** The anchor tick in score seconds, before the tempo scale. */
  readonly seconds: number
  /** The practice tempo from this anchor on. */
  readonly scale: number
}

/**
 * A note being struck, or word that what was scheduled will not sound.
 *
 * Anything that draws the strike takes it from here, which is the same event
 * and the same time the engine is given. Deriving it from the draw loop
 * instead would put the flash a frame or two from its sound, which is the
 * error the whole clock design exists to avoid.
 */
export type StrikeEvent =
  | {
      readonly kind: 'strike'
      /** As written: the transposition is applied at the engine's door, not here. */
      readonly pitch: number
      readonly velocity: number
      readonly at: AudioTime
    }
  | { readonly kind: 'silence' }

/** A stretch of the piece to repeat, in ticks, its end not included. */
export type LoopRange = {
  readonly start: number
  readonly end: number
}

export class Scheduler {
  private timing: ResolvedTiming | null = null
  private events: TimelineEvent[] = []
  private pedals: readonly PedalEvent[] = []
  private cursor = 0
  /**
   * The mappings between ticks and audio time, oldest first. There is more
   * than one while a tempo change or a loop's jump back has been scheduled
   * ahead of the clock: until the clock reaches it, the mapping before it is
   * still the one that says what is sounding.
   */
  private anchors: Anchor[] = [{ tick: 0, time: 0, seconds: 0, scale: 1 }]
  private scale = 1
  private loopRange: LoopRange | null = null
  /** Where this pass began: a note struck before it was never sent, so neither is its release. */
  private fromTick = 0
  /** Everything before this audio time has been handed to the engine. */
  private scheduledUntil: AudioTime = 0
  /** When the last event handed over sounds. */
  private lastAt: AudioTime = 0
  /** Notes handed to the engine and not yet released, by pitch, for a loop to release at its end. */
  private readonly open = new Map<number, number>()
  private started = false
  private ended = false
  private cancel: (() => void) | null = null
  /** Where the clicks go while the metronome is on. */
  private clicker: Clicker | null = null
  /**
   * Which parts, hands and voices sound. Asked per note as it is handed
   * over, so a mute lands on the next note and never cuts a chord that is
   * already sounding: the release of a note already struck still goes.
   */
  private filter: PlaybackFilter = {}

  constructor(
    private readonly engine: PianoEngine,
    private readonly clock: Clock,
    private readonly ticker: Ticker = intervalTicker,
    /** Called once when the clock passes the last note of a pass that does not loop. */
    private readonly onEnd: () => void = () => {},
    /** Told of every strike as it is handed over, for anything that draws it. */
    private readonly onStrike: (strike: StrikeEvent) => void = () => {},
  ) {}

  /** Replace what is to be played. Stops first, since a timeline cannot change under a cursor. */
  load(performance: Performance): void {
    this.stop()
    this.timing = performance.timing
    this.events = timelineOf(performance, { beats: true })
    this.pedals = performance.expression?.pedals ?? []
  }

  /** Started and not stopped, including the tail after the last event was handed over. */
  get playing(): boolean {
    return this.started
  }

  /** Every event has been handed to the engine and nothing loops back: nothing is left to wake for. */
  get finished(): boolean {
    return this.cursor >= this.events.length && this.activeLoop() === null
  }

  /** The practice tempo, as a multiple of the written one: 0.5 is half speed. */
  get tempoScale(): number {
    return this.scale
  }

  get loop(): LoopRange | null {
    return this.loopRange
  }

  /** What sounds. Takes effect at the next note handed over, not at the next chord cut off. */
  setFilter(filter: PlaybackFilter): void {
    this.filter = filter
  }

  get playbackFilter(): PlaybackFilter {
    return this.filter
  }

  /** Click the beats through a clicker, or stop clicking with null. Takes effect from the next wake. */
  setMetronome(clicker: Clicker | null): void {
    this.clicker?.stopAll()
    this.clicker = clicker
  }

  /**
   * Repeat a stretch, or stop repeating. A loop takes hold when playing
   * crosses its end, so a pass that starts after the end plays on through.
   */
  setLoop(range: LoopRange | null): void {
    this.loopRange = range !== null && range.end > range.start && range.start >= 0 ? range : null
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
    this.ended = false
    this.open.clear()
    this.anchors = [
      { tick: fromTick, time: at, seconds: ticksToSeconds(timing, fromTick), scale: this.scale },
    ]
    this.seekCursor(fromTick)
    this.scheduledUntil = at
    this.lastAt = at

    for (const pedal of new Set(this.pedals.map((event) => event.pedal))) {
      const value = pedalValueAt(this.pedals, pedal, fromTick - 1)
      if (value > 0) {
        this.engine.pedal(pedal, value, at)
      }
    }

    this.cancel = this.ticker(() => {
      this.wake()
    }, WAKE_INTERVAL_MS)
    this.wake()
  }

  /** Stop and silence, answering the tick that was sounding, which is where a resume starts. */
  stop(): number {
    const now = this.clock.now()
    const tick = this.started ? this.tickAt(now) : this.current().tick
    this.halt()
    this.started = false
    this.open.clear()
    if (this.timing !== null) {
      this.anchors = [
        { tick, time: now, seconds: ticksToSeconds(this.timing, tick), scale: this.scale },
      ]
    }
    this.engine.stopAll()
    this.clicker?.stopAll()
    this.onStrike({ kind: 'silence' })
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
    this.scale = scale
    if (this.started && this.timing !== null) {
      const tick = this.tickAt(this.scheduledUntil)
      this.anchors.push({
        tick,
        time: this.scheduledUntil,
        seconds: ticksToSeconds(this.timing, tick),
        scale,
      })
    }
  }

  /** The audio time a tick will sound at, under the mapping now being scheduled. */
  timeAt(tick: number): AudioTime {
    const anchor = this.current()
    if (this.timing === null) {
      return anchor.time
    }
    return anchor.time + (ticksToSeconds(this.timing, tick) - anchor.seconds) / anchor.scale
  }

  /** The tick sounding at an audio time: what the roll draws and the transport reports. */
  tickAt(time: AudioTime): number {
    const anchor = this.anchorAt(time)
    if (this.timing === null) {
      return anchor.tick
    }
    const seconds = anchor.seconds + (time - anchor.time) * anchor.scale
    return Math.max(anchor.tick, secondsToTicks(this.timing, seconds))
  }

  private current(): Anchor {
    return this.anchors[this.anchors.length - 1] ?? { tick: 0, time: 0, seconds: 0, scale: 1 }
  }

  /** The mapping in force at a time: the latest one the clock has reached by then. */
  private anchorAt(time: AudioTime): Anchor {
    let found = this.anchors[0] ?? this.current()
    for (const anchor of this.anchors) {
      if (anchor.time <= time) {
        found = anchor
      }
    }
    return found
  }

  /** The loop this pass will jump back from, if it started before the loop's end. */
  private activeLoop(): LoopRange | null {
    const loop = this.loopRange
    return loop !== null && this.current().tick < loop.end ? loop : null
  }

  private seekCursor(tick: number): void {
    const index = this.events.findIndex((event) => event.tick >= tick)
    this.cursor = index === -1 ? this.events.length : index
    this.fromTick = tick
  }

  private wake(): void {
    const now = this.clock.now()
    const horizon = now + LOOK_AHEAD_SECONDS
    // Mappings the clock has left behind answer nothing any more.
    while (this.anchors.length > 1 && (this.anchors[1]?.time ?? Infinity) <= now) {
      this.anchors.shift()
    }

    for (;;) {
      const event = this.events[this.cursor]
      const loop = this.activeLoop()
      if (loop !== null && (event === undefined || event.tick >= loop.end)) {
        const at = this.timeAt(loop.end)
        if (at >= horizon) {
          break
        }
        this.jumpBack(loop, at)
        continue
      }
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

    if (this.finished && now >= this.lastAt && !this.ended) {
      this.ended = true
      this.halt()
      this.onEnd()
    }
  }

  /**
   * The end of a loop, at the time it sounds: let go of every note still
   * down, put the pedals as they stand at the loop's start, and carry on
   * from there on a new mapping.
   */
  private jumpBack(loop: LoopRange, at: AudioTime): void {
    for (const [pitch, count] of this.open) {
      for (let index = 0; index < count; index += 1) {
        this.engine.noteOff(pitch, at)
      }
    }
    this.open.clear()
    for (const pedal of new Set(this.pedals.map((event) => event.pedal))) {
      const atEnd = pedalValueAt(this.pedals, pedal, loop.end - 1)
      const atStart = pedalValueAt(this.pedals, pedal, loop.start - 1)
      if (atEnd !== atStart) {
        this.engine.pedal(pedal, atStart, at)
      }
    }
    if (this.timing !== null) {
      this.anchors.push({
        tick: loop.start,
        time: at,
        seconds: ticksToSeconds(this.timing, loop.start),
        scale: this.scale,
      })
    }
    this.seekCursor(loop.start)
    this.lastAt = Math.max(this.lastAt, at)
  }

  private hand(event: TimelineEvent, at: AudioTime): void {
    this.lastAt = Math.max(this.lastAt, at)
    switch (event.kind) {
      case 'on':
        if (!noteAudible(event, this.filter)) {
          return
        }
        this.open.set(event.pitch, (this.open.get(event.pitch) ?? 0) + 1)
        this.engine.noteOn(event.pitch, event.velocity, at)
        this.onStrike({ kind: 'strike', pitch: event.pitch, velocity: event.velocity, at })
        return
      case 'off': {
        const sounding = this.open.get(event.pitch) ?? 0
        if (event.struck >= this.fromTick && sounding > 0) {
          this.open.set(event.pitch, sounding - 1)
          this.engine.noteOff(event.pitch, at)
        }
        return
      }
      case 'pedal':
        this.engine.pedal(event.pedal, event.value, at)
        return
      case 'click':
        this.clicker?.click(at, event.accent)
        return
    }
  }

  private halt(): void {
    this.cancel?.()
    this.cancel = null
  }
}
