import type { Note, PlaybackFilter, ResolvedTiming, Section } from '@piano/score-format'

import type { AudioTime, Transport } from '../audio'
import {
  DEFAULT_STRICTNESS,
  expectedFrom,
  grade,
  judge,
  noteKey,
  WINDOWS,
  type Attempt,
  type Expected,
  type Feedback,
  type KeyMark,
  type Outcome,
  type Played,
  type Strictness,
} from './grading'
import { NO_LATENCY, struckAt, type Latency } from './latency'
import type { MidiEvent } from './midi'
import { playerNotes } from './practice'

/**
 * Watching an attempt: what was played, where it landed, and how it went.
 *
 * A pass is the unit. It begins when playback starts and ends when playback
 * comes to rest, and what it grades is the stretch that was actually played
 * rather than the whole piece, so stopping after eight bars is a report on
 * eight bars. A pass nobody played a note in is not an attempt at all — that
 * is listening — and it leaves the last report alone rather than declaring
 * every note missed.
 *
 * Every strike is put back where the machine's lag moved it before it is
 * written down: struckAt for when the key really went down, less the output
 * latency, which is how long after being scheduled the note the player was
 * answering was actually heard. Grading raw arrival times would mark a
 * perfectly timed player late by whatever their audio driver costs.
 *
 * Which notes are owed comes from the same place wait mode's do: a part the
 * app has been told not to sound is a part somebody is playing themselves.
 * Two notions of a correct note would be two apps.
 */

export type GraderState = {
  readonly strictness: Strictness
  /** Whether a pass is being watched now. */
  readonly running: boolean
  /** Notes taken in this pass so far, which is how a view says it is listening. */
  readonly taken: number
  /** The last attempt graded, or null until there has been one. */
  readonly attempt: Attempt | null
  /**
   * What the roll and the keyboard are showing now. Judged as each strike
   * arrives rather than at the end of the pass, because feedback that waits
   * for the piece to finish is a report and not feedback.
   */
  readonly feedback: Feedback
}

export type Grader = {
  readonly state: GraderState
  readonly subscribe: (listener: () => void) => () => void
  readonly setStrictness: (strictness: Strictness) => void
  /** The piece, who is playing which part of it, and its named sections. */
  readonly use: (
    timing: ResolvedTiming,
    notes: readonly Note[],
    filter: PlaybackFilter,
    sections?: readonly Section[],
  ) => void
  /**
   * The lag to reckon strikes against. Told rather than asked, because the
   * grader outlives the view that knows it.
   */
  readonly useLatency: (latency: Latency) => void
  /** A note played, from either input; expressive says whether that input has velocity. */
  readonly played: (event: MidiEvent, expressive: boolean) => void
  /** Stop listening to the transport. */
  readonly close: () => void
}

export function createGrader(
  transport: Transport,
  now: () => AudioTime,
  options: { readonly strictness?: Strictness } = {},
): Grader {
  let strictness = options.strictness ?? DEFAULT_STRICTNESS
  let timing: ResolvedTiming | null = null
  let sections: readonly Section[] = []
  let latency: Latency = NO_LATENCY
  let attempt: Attempt | null = null
  let running = false
  /** Where this pass began, which is the first tick anything is owed at. */
  let from = 0
  let strikes: Played[] = []
  /** Every note the player owes in the whole piece, which is what a strike is judged against. */
  let owedNotes: readonly Expected[] = []
  /** The same notes by key, so the roll can tell a note nobody owes from one nobody played. */
  let owed: ReadonlySet<string> = new Set()
  /** What became of each note this pass, and which of them are answered for good. */
  let looks = new Map<string, Outcome>()
  let answered = new Set<string>()
  let keys = new Map<number, KeyMark>()
  const listeners = new Set<() => void>()
  let state: GraderState = {
    strictness,
    running: false,
    taken: 0,
    attempt: null,
    feedback: { notes: looks, owed, keys, attempting: false, window: WINDOWS[strictness] },
  }

  const changed = () => {
    state = {
      strictness,
      running,
      taken: strikes.length,
      attempt,
      // Rebuilt around the same maps: the view reads them once a frame, and
      // copying them on every strike would allocate a map per note played.
      feedback: {
        notes: looks,
        owed,
        keys,
        attempting: strikes.length > 0,
        window: WINDOWS[strictness],
      },
    }
    for (const listener of listeners) {
      listener()
    }
  }

  /**
   * Whether the score is standing at a note wait mode is waiting for.
   *
   * It matters twice. A hold is not the end of a pass, or an attempt in wait
   * mode would be one report per note; and a note played into a hold is on
   * time by construction, because the score waited for it.
   */
  const held = () =>
    transport.status === 'paused' &&
    transport.heldAt !== null &&
    transport.position() === transport.heldAt

  const begin = () => {
    running = true
    strikes = []
    // A pass starts with a clean field: what the last attempt made of a note
    // says nothing about this one.
    looks = new Map()
    answered = new Set()
    keys = new Map()
    from = transport.position()
    changed()
  }

  const end = () => {
    running = false
    if (strikes.length > 0 && timing !== null) {
      // The stretch covered: up to where playback came to rest, and never less
      // than the furthest anything was played, so a pass that looped back
      // still owes the notes it went past.
      //
      // The tick it came to rest on is where it will carry on from, so the
      // notes written there have not been played yet: a passage held at the
      // end of bar four does not owe the note that starts bar five.
      const covered = strikes.reduce(
        (last, strike) => Math.max(last, strike.tick + 1),
        Math.max(from, transport.reached),
      )
      attempt = grade(
        owedNotes.filter((note) => note.tick >= from && note.tick < covered),
        strikes,
        { timing, sections, strictness },
      )
    }
    changed()
  }

  /**
   * What this strike means, said at once: the key shows what became of it and
   * the note on the roll shows what became of it.
   *
   * A fluff marks the note it was aimed at without answering it, so the
   * player correcting themselves a moment later still lands on that note and
   * the roll shows it going from wrong to played.
   */
  const mark = (strike: Played, at: number) => {
    if (timing === null) {
      return
    }
    const verdict = judge(owedNotes, strike, { timing, strictness, claimed: answered })
    if (verdict.note !== null) {
      const key = noteKey(verdict.note.tick, verdict.note.pitch)
      looks.set(key, verdict.outcome === 'extra' ? 'wrong' : verdict.outcome)
      if (verdict.settles) {
        answered.add(key)
      }
    }
    keys.set(strike.pitch, { outcome: verdict.outcome, at })
  }

  const watching = transport.subscribe(() => {
    if (transport.status === 'playing') {
      if (!running) {
        begin()
      }
      return
    }
    if (running && !held()) {
      end()
    }
  })

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
    setStrictness: (next) => {
      strictness = next
      changed()
    },
    use: (nextTiming, nextNotes, nextFilter, nextSections = []) => {
      timing = nextTiming
      sections = nextSections
      owedNotes = expectedFrom(playerNotes(nextNotes, nextFilter), 0, Number.POSITIVE_INFINITY)
      owed = new Set(owedNotes.map((note) => noteKey(note.tick, note.pitch)))
      changed()
    },
    useLatency: (next) => {
      latency = next
    },
    played: (event, expressive) => {
      const waiting = held()
      if (!running || event.kind !== 'on' || (transport.status !== 'playing' && !waiting)) {
        return
      }
      // On the clock the score is scheduled against: the key going down, less
      // how late what the player answered was heard.
      const at = struckAt(now(), latency) - latency.output
      if (transport.isCountIn(at)) {
        return
      }
      const tick = waiting ? (transport.heldAt ?? transport.position()) : transport.tickAt(at)
      const strike: Played = {
        pitch: event.pitch,
        velocity: event.velocity,
        tick,
        // Nothing to make up where the score stood still waiting for this
        // note: it arrived when it was asked for, however long that took.
        slip: waiting ? 0 : at - transport.timeAt(tick),
        scale: transport.tempoScale,
        expressive,
      }
      strikes.push(strike)
      if (timing !== null) {
        mark(strike, at)
      }
      changed()
    },
    close: () => {
      watching()
    },
  }
}
