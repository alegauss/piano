import {
  resolveRange,
  type Hand,
  type RangeRequest,
  type ResolvedTiming,
  type Section,
  type TickRange,
} from '@piano/score-format'

import type { Transport } from '../audio'
import type { Grader } from './grader'
import { faults, type Attempt } from './grading'
import { HANDS, type OtherHand } from './parts'

/**
 * Practice, which is not playing a piece from beginning to end.
 *
 * It is four bars until they stop failing, slowly and then faster, and the
 * hands taken apart. All three are one request here rather than three
 * features, because the sentence somebody says is "left hand only, bars 17 to
 * 20, starting at half tempo and climbing" and an engine that cannot take that
 * as one request makes them set it up three times.
 *
 * A repetition is a pass and not a lap of a seamless loop, which is what lets
 * it be graded: playback stops dead at the end of the range, the grader says
 * how it went, the tempo moves by a step, and the next pass starts after a
 * short gap. Climbing on a clean repetition and dropping back on a failed one
 * is the standard drill, and it is automated for the reason anybody automates
 * it: doing it by hand means stopping to change a number every thirty seconds.
 *
 * A drill holds playback at the end of its range, and there is one place to
 * hold it, so wait mode is the other way of practising rather than another
 * thing running at the same time.
 */

/** How much a clean repetition adds to the tempo. */
export const DEFAULT_STEP = 0.05

/** Seconds of quiet between repetitions: long enough to breathe, short enough to stay in it. */
export const DEFAULT_GAP_SECONDS = 1

/** The slowest and the fastest a drill will drive the tempo. */
export const MIN_TEMPO_SCALE = 0.25
export const MAX_TEMPO_SCALE = 1

/** What a drill is asked for, in one request. */
export type DrillRequest = {
  /** What to repeat: a named section, a run of bars, or ticks. */
  readonly range: RangeRequest
  /** The hands the player takes. Both, where nothing says otherwise. */
  readonly hands?: readonly Hand[]
  /** Whether the hand they have not taken accompanies them or says nothing. */
  readonly other?: OtherHand
  /** Where the tempo starts, as a fraction of written. */
  readonly from?: number
  /** How much a clean repetition adds, and where the climb stops. */
  readonly step?: number
  readonly to?: number
  readonly gap?: number
  /** A bar of clicks before each repetition. */
  readonly countIn?: boolean
}

export type DrillState = {
  readonly running: boolean
  readonly range: TickRange | null
  readonly hands: readonly Hand[]
  readonly tempoScale: number
  readonly passes: number
  readonly clean: number
  /** How the last repetition went, or null where nothing was played into it. */
  readonly last: 'clean' | 'faulty' | null
}

/** How the gap between repetitions is waited out. Injected, so a test can run it by hand. */
export type Wait = (seconds: number, run: () => void) => () => void

const timers: Wait = (seconds, run) => {
  const id = setTimeout(run, seconds * 1000)
  return () => {
    clearTimeout(id)
  }
}

export type Drill = {
  readonly state: DrillState
  readonly subscribe: (listener: () => void) => () => void
  /** The piece's own timing and named passages, for resolving what to repeat. */
  readonly use: (timing: ResolvedTiming, sections: readonly Section[]) => void
  readonly start: (request: DrillRequest) => void
  readonly stop: () => void
  readonly close: () => void
}

export function createDrill(
  transport: Transport,
  grader: Grader,
  options: {
    readonly wait?: Wait
    /**
     * Told which hands the drill has taken, so the session's own view of the
     * piece follows. Called again when the drill stops, which hands the
     * keyboard back: both hands, nothing silenced.
     */
    readonly hands?: (plays: readonly Hand[], other: OtherHand) => void
    /**
     * Run before a drill takes the transport, for whatever else was holding
     * playback. A drill and wait mode are two ways of practising rather than
     * two things running at once, and there is one place to stop playback.
     */
    readonly before?: () => void
  } = {},
): Drill {
  const wait = options.wait ?? timers
  let timing: ResolvedTiming | null = null
  let sections: readonly Section[] = []
  let running = false
  /** True between the start of a repetition and its end, so each one ends once. */
  let inPass = false
  let range: TickRange | null = null
  let hands: readonly Hand[] = HANDS
  let tempo = 1
  let floor = MIN_TEMPO_SCALE
  let ceiling = MAX_TEMPO_SCALE
  let step = DEFAULT_STEP
  let gap = DEFAULT_GAP_SECONDS
  let passes = 0
  let clean = 0
  let last: DrillState['last'] = null
  /** The count-in the session had, since a drill only borrows it. */
  let borrowedCountIn = false
  let resting: (() => void) | null = null
  const listeners = new Set<() => void>()
  let state: DrillState = {
    running: false,
    range: null,
    hands: HANDS,
    tempoScale: 1,
    passes: 0,
    clean: 0,
    last: null,
  }

  const changed = () => {
    state = { running, range, hands, tempoScale: tempo, passes, clean, last }
    for (const listener of listeners) {
      listener()
    }
  }

  /** Past a float's idea of 0.8500000000000001, which a tempo readout would show. */
  const round = (scale: number) => Math.round(scale * 100) / 100

  const begin = () => {
    if (range === null) {
      return
    }
    transport.setTempoScale(tempo)
    transport.seek(range.start)
    transport.hold(range.end)
    transport.play()
    // Last, because everything above it tells the transport something and the
    // transport tells its listeners, and a repetition that is not under way
    // yet must not look like one that has just ended.
    inPass = true
    changed()
  }

  /**
   * The tempo after a repetition: up a step when it was clean, back a step
   * when it was not, and where it was when nothing was played into it. A
   * repetition nobody played is not a failure, but it is not a reason to go
   * faster either.
   */
  const finished = (attempt: Attempt | null) => {
    passes += 1
    if (attempt === null) {
      last = null
    } else if (faults(attempt.tally) === 0) {
      last = 'clean'
      clean += 1
      tempo = Math.min(ceiling, round(tempo + step))
    } else {
      last = 'faulty'
      tempo = Math.max(floor, round(tempo - step))
    }
    changed()
    resting = wait(gap, () => {
      resting = null
      if (running) {
        begin()
      }
    })
  }

  /**
   * The end of a repetition: let playback run again, put it back at the start
   * of the range, and take what the grader made of it. The seek is what ends
   * the pass for the grader, which is why the attempt is read after it.
   */
  const endPass = () => {
    if (!running || !inPass || range === null) {
      return
    }
    inPass = false
    transport.hold(null)
    const before = grader.state.attempt
    transport.seek(range.start)
    const after = grader.state.attempt
    finished(after === before ? null : after)
  }

  const stopHold = transport.onHold((tick) => {
    if (running && inPass && tick === range?.end) {
      endPass()
    }
  })

  const watching = transport.subscribe(() => {
    if (!running || !inPass) {
      return
    }
    // The piece ran out before the range did: that is a repetition too.
    if (transport.status === 'stopped') {
      endPass()
      return
    }
    // Coming to rest on the hold is the end of a repetition, and onHold says
    // so a moment later. Anywhere else is somebody pressing pause, which is
    // how a drill is left.
    if (transport.status === 'paused' && transport.position() !== range?.end) {
      stop()
    }
  })

  function stop(): void {
    if (!running) {
      return
    }
    running = false
    inPass = false
    resting?.()
    resting = null
    transport.hold(null)
    transport.setCountIn(borrowedCountIn)
    options.hands?.(HANDS, 'accompanies')
    changed()
  }

  return {
    get state() {
      return state
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    use: (nextTiming, nextSections) => {
      timing = nextTiming
      sections = nextSections
    },
    start: (request) => {
      if (timing === null) {
        return
      }
      const asked = resolveRange(request.range, timing, sections)
      if (asked === null || asked.end <= asked.start) {
        return
      }
      resting?.()
      resting = null
      options.before?.()
      range = asked
      hands = request.hands === undefined || request.hands.length === 0 ? HANDS : request.hands
      options.hands?.(hands, request.other ?? 'accompanies')
      step = request.step ?? DEFAULT_STEP
      floor = Math.max(MIN_TEMPO_SCALE, request.from ?? transport.tempoScale)
      ceiling = Math.max(floor, Math.min(MAX_TEMPO_SCALE, request.to ?? MAX_TEMPO_SCALE))
      tempo = floor
      gap = request.gap ?? DEFAULT_GAP_SECONDS
      borrowedCountIn = transport.countIn
      transport.setCountIn(request.countIn ?? false)
      passes = 0
      clean = 0
      last = null
      running = true
      begin()
    },
    stop,
    close: () => {
      stop()
      stopHold()
      watching()
    },
  }
}
