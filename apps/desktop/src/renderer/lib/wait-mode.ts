import type { Note, PlaybackFilter } from '@piano/score-format'

import type { Transport } from '../audio'
import type { MidiEvent } from './midi'
import {
  CHORD_TICKS,
  extras,
  nextExpectation,
  outstanding,
  playerNotes,
  resumeTick,
  satisfied,
  type Expectation,
} from './practice'

/**
 * The score does not move until the right notes have been played.
 *
 * It is the most useful practice feature and nearly the simplest: playback
 * runs to the next note the player owes, stops dead on it, lights the keys
 * it is waiting for, and carries on the moment they are struck.
 *
 * Stopping dead is the part that needs the transport's help. A pause when
 * the clock arrives would be too late, because notes are handed to the
 * engine a tenth of a second early; the transport holds at the tick instead,
 * so nothing sounds ahead of a learner who has not got there yet.
 *
 * What it waits for comes from the parts panel, through playerNotes: a part
 * the app has been told not to play is a part somebody is playing, and the
 * rest is accompaniment that keeps its place.
 */

export type WaitState = {
  readonly on: boolean
  /** The group being waited for, or null when nothing is being waited on. */
  readonly expectation: Expectation | null
  /** The pitches of it still to play, which is what lights up. */
  readonly outstanding: readonly number[]
  /** Notes played while waiting that were not asked for. Noted, never blocking. */
  readonly extras: readonly number[]
}

export type WaitMode = {
  readonly state: WaitState
  readonly subscribe: (listener: () => void) => () => void
  readonly setOn: (on: boolean) => void
  /** The score and who is playing which part of it. */
  readonly use: (notes: readonly Note[], filter: PlaybackFilter) => void
  /** A note played, from either input. */
  readonly played: (event: MidiEvent) => void
  /** Stop listening to the transport. */
  readonly close: () => void
}

export function createWaitMode(transport: Transport): WaitMode {
  let on = false
  let notes: readonly Note[] = []
  let filter: PlaybackFilter = {}
  let expectation: Expectation | null = null
  let struck = new Set<number>()
  /** Whether the hold on the transport is this one's to let go of. */
  let holding = false
  const listeners = new Set<() => void>()
  let state: WaitState = { on: false, expectation: null, outstanding: [], extras: [] }

  /**
   * Hold, or let go of a hold this put there.
   *
   * There is one place to stop playback and more than one practice tool that
   * stops it: a drill holds at the end of the passage it repeats. Releasing a
   * hold nobody here set would let that passage run on for ever.
   */
  const hold = (tick: number | null) => {
    if (tick === null && !holding) {
      return
    }
    holding = tick !== null
    transport.hold(tick)
  }

  const changed = () => {
    const owed = expectation
    state = {
      on,
      expectation: owed,
      outstanding: owed === null ? [] : outstanding(owed, struck),
      extras: owed === null ? [] : extras(owed, struck),
    }
    for (const listener of listeners) {
      listener()
    }
  }

  const mine = () => playerNotes(notes, filter)

  /** Hold at the next group the player owes, from where playback stands. */
  const aim = () => {
    if (!on) {
      expectation = null
      hold(null)
      changed()
      return
    }
    struck = new Set()
    expectation = nextExpectation(mine(), transport.position())
    hold(expectation?.tick ?? null)
    changed()
  }

  /** The group has been played: carry on from where it says. */
  const carryOn = () => {
    if (expectation === null) {
      return
    }
    const accompanied = mine().length < notes.length
    const from = resumeTick(expectation, accompanied)
    struck = new Set()
    // Past the whole group, not just past its first tick: a chord spread
    // over a few ticks would otherwise have its own later notes waited for
    // a second time.
    expectation = nextExpectation(mine(), expectation.tick + CHORD_TICKS + 1)
    hold(expectation?.tick ?? null)
    transport.seek(from)
    transport.play()
    changed()
  }

  const stopHold = transport.onHold(() => {
    // Arrived at the group: from here the player decides when it moves. A
    // hold somebody else set says nothing about what this is waiting for.
    if (holding) {
      changed()
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
    setOn: (next) => {
      on = next
      aim()
    },
    use: (nextNotes, nextFilter) => {
      notes = nextNotes
      filter = nextFilter
      if (on) {
        aim()
      }
    },
    played: (event) => {
      if (!on || expectation === null || event.kind !== 'on') {
        return
      }
      struck.add(event.pitch)
      if (satisfied(expectation, struck)) {
        carryOn()
        return
      }
      changed()
    },
    close: () => {
      stopHold()
      hold(null)
    },
  }
}
