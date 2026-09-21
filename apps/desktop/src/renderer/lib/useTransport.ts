import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { LoopRange, Transport, TransportStatus } from '../audio'

/**
 * What the controls read.
 *
 * The transport is an independent state machine: it stops itself at the end
 * of a piece, refuses a play it is already doing, and clamps a transposition
 * it thinks is silly. So the bar never keeps a copy of what it asked for. It
 * subscribes, and shows what actually happened — which is the difference
 * between a pause button that greys out and one that lies.
 */

export type TransportState = {
  readonly status: TransportStatus
  readonly tempoScale: number
  readonly transpose: number
  readonly loop: LoopRange | null
}

function read(transport: Transport): TransportState {
  return {
    status: transport.status,
    tempoScale: transport.tempoScale,
    transpose: transport.transpose,
    loop: transport.loop,
  }
}

function same(one: TransportState, other: TransportState): boolean {
  return (
    one.status === other.status &&
    one.tempoScale === other.tempoScale &&
    one.transpose === other.transpose &&
    one.loop?.start === other.loop?.start &&
    one.loop?.end === other.loop?.end
  )
}

export function useTransportState(transport: Transport): TransportState {
  // useSyncExternalStore compares snapshots with Object.is, so a fresh object
  // every call would spin for ever. The last one is kept and only replaced
  // when something in it actually changed.
  const held = useRef<TransportState | null>(null)

  const snapshot = useCallback(() => {
    const next = read(transport)
    if (held.current === null || !same(held.current, next)) {
      held.current = next
    }
    return held.current
  }, [transport])

  const subscribe = useCallback(
    (listener: () => void) => transport.subscribe(listener),
    [transport],
  )

  return useSyncExternalStore(subscribe, snapshot)
}

/** How often the position is read for the clock and the scrubber. */
const POSITION_INTERVAL_MS = 100

/**
 * Where playback is, for the things that show a number rather than draw.
 *
 * Ten times a second, not sixty: a clock reading 0:07 does not need redrawing
 * every frame, and re-rendering the whole bar at frame rate to move a slider
 * by a pixel is how a control surface starts costing more than the roll it
 * controls. The roll itself reads the position every frame, directly.
 */
export function usePosition(transport: Transport): number {
  const [tick, setTick] = useState(() => transport.position())

  useEffect(() => {
    const id = setInterval(() => {
      setTick(transport.position())
    }, POSITION_INTERVAL_MS)
    return () => {
      clearInterval(id)
    }
  }, [transport])

  return tick
}
