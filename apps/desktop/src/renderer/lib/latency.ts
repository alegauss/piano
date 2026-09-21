import type { Settings } from '@piano/ipc'

import type { SettingsStore } from './settings'

/**
 * How late the machine is, measured before anyone is graded on it.
 *
 * Two delays matter and they are not the same thing.
 *
 * Output latency is how long after a note is scheduled it is actually heard.
 * Web Audio reports an estimate, which is usually close enough, and on a
 * platform that reports nothing there is a floor rather than a zero, because
 * no machine is instant.
 *
 * Input latency is how long after a key is struck the event arrives, and
 * nothing reports it at all. So it is measured: the app clicks a dozen times,
 * the player strikes along, and the median offset is the figure. The median
 * and not the mean, because anyone will mistime one or two and an average
 * drags towards the mistake.
 *
 * Both are subtracted before any timing judgement, and both are shown rather
 * than hidden: an absurd figure almost always means a bad audio driver, and
 * saying so out loud is more use than quietly grading someone late.
 */

/** No machine is instant; this is the floor when the platform reports nothing. */
const ASSUMED_OUTPUT_SECONDS = 0.01

/** Past this, a figure is not a player's reaction time: it is a broken setup. */
export const SUSPICIOUS_SECONDS = 0.25

/** How many strikes a calibration asks for. */
export const CALIBRATION_STRIKES = 12

/** Seconds between the clicks a calibration plays. */
export const CALIBRATION_INTERVAL = 1

export type Latency = {
  /** Seconds between scheduling a note and hearing it. */
  readonly output: number
  /** Seconds between a key going down and the event arriving. Zero until measured. */
  readonly input: number
}

export const NO_LATENCY: Latency = { output: 0, input: 0 }

/**
 * What the platform says about its own output, with a floor under it.
 *
 * Takes the two numbers rather than a context: Web Audio belongs to the
 * audio layer, and this file is the arithmetic.
 */
export function outputLatencyOf(reported: {
  readonly outputLatency?: number
  readonly baseLatency?: number
}): number {
  return Math.max(ASSUMED_OUTPUT_SECONDS, reported.outputLatency || reported.baseLatency || 0)
}

/** The middle value, which is what a dozen strikes by a human needs. */
export function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((one, other) => one - other)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0
  }
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

/** How far the strikes were spread, which says whether to trust the figure. */
export function spread(values: readonly number[]): number {
  if (values.length < 2) {
    return 0
  }
  const middle = median(values)
  return median(values.map((value) => Math.abs(value - middle)))
}

/** A figure this large is a broken setup rather than a slow player. */
export function suspicious(seconds: number): boolean {
  return Math.abs(seconds) > SUSPICIOUS_SECONDS
}

/**
 * When a note scheduled for an audio time is actually heard.
 *
 * Grading compares what the player did against what they heard, so this is
 * the side of the comparison the score is on.
 */
export function heardAt(scheduled: number, latency: Latency): number {
  return scheduled + latency.output
}

/** When a key was really struck, given when its event arrived. */
export function struckAt(arrived: number, latency: Latency): number {
  return arrived - latency.input
}

/** Milliseconds, for a person to read. */
export function milliseconds(seconds: number): string {
  return `${String(Math.round(seconds * 1000))} ms`
}

/**
 * Calibration is per device and per output: a Bluetooth headset and a
 * controller each change the figure, so a measurement taken with one setup
 * says nothing about another.
 */
export function calibrationKey(device: string | null, output: string | null): string {
  return `piano.latency|${device ?? 'keys'}|${output ?? 'default'}`
}

/** The figure measured for a setup, from the settings, or null where it has never been measured. */
export function savedInputLatency(settings: Settings, key: string): number | null {
  return settings.calibrations[key] ?? null
}

/** Keep a figure for a setup, beside the ones measured for every other. */
export function saveInputLatency(store: SettingsStore, key: string, seconds: number): void {
  store.update({ calibrations: { ...store.state.settings.calibrations, [key]: seconds } })
}

export type CalibrationState = {
  readonly running: boolean
  /** Strikes taken so far, out of the number asked for. */
  readonly taken: number
  readonly of: number
  /** The figure, once there are enough strikes to have one. */
  readonly offset: number | null
  /** How scattered the strikes were, which is how much to trust the offset. */
  readonly scatter: number
  readonly suspicious: boolean
}

export type Calibrator = {
  readonly state: CalibrationState
  readonly subscribe: (listener: () => void) => () => void
  /** Click through the routine, a click a second. */
  readonly start: () => void
  readonly stop: () => void
  /** A key struck at an audio time, from either input. */
  readonly strike: (at: number) => void
  /**
   * The lag to reckon the clicks against. Told rather than asked, because
   * the calibrator outlives the view that knows it and a view should not be
   * handing out a reference to its own current state.
   */
  readonly useLatency: (latency: Latency) => void
}

/**
 * The routine: a click a second, a strike expected on each, and the median
 * of what came back.
 *
 * A strike is matched to the click it is nearest, so somebody a little early
 * is still counted against the click they meant, with a negative offset.
 * Only a strike outside the run of clicks altogether is dropped, and the
 * window is deliberately as wide as half an interval: the setups most worth
 * catching are the badly broken ones, and a window tight enough to keep a
 * three-hundred-millisecond driver out would measure every machine except
 * the ones that need measuring.
 */
export function createCalibrator(
  clicker: { click: (at: number, accent: boolean) => void; stopAll: () => void },
  now: () => number,
  options: {
    readonly strikes?: number
    readonly interval?: number
    readonly latency?: Latency
  } = {},
): Calibrator {
  let latency = options.latency ?? NO_LATENCY
  const wanted = options.strikes ?? CALIBRATION_STRIKES
  const interval = options.interval ?? CALIBRATION_INTERVAL
  const listeners = new Set<() => void>()
  let offsets: number[] = []
  /** When each click is heard, which is what a player answers. */
  let heard: number[] = []
  let running = false
  let state: CalibrationState = {
    running: false,
    taken: 0,
    of: wanted,
    offset: null,
    scatter: 0,
    suspicious: false,
  }

  const changed = () => {
    const offset = offsets.length >= Math.ceil(wanted / 2) ? median(offsets) : null
    state = {
      running,
      taken: offsets.length,
      of: wanted,
      offset,
      scatter: spread(offsets),
      suspicious: offset !== null && suspicious(offset),
    }
    for (const listener of listeners) {
      listener()
    }
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
    start: () => {
      offsets = []
      running = true
      // A count-in click, then the ones being measured: nobody is in time
      // with the first sound they hear.
      const from = now() + interval
      heard = []
      for (let index = 0; index < wanted + 1; index += 1) {
        const at = from + index * interval
        clicker.click(at, index === 0)
        if (index > 0) {
          heard.push(heardAt(at, latency))
        }
      }
      changed()
    },
    stop: () => {
      running = false
      clicker.stopAll()
      changed()
    },
    useLatency: (next) => {
      latency = next
    },
    strike: (at) => {
      if (!running) {
        return
      }
      const nearest = heard.reduce(
        (best, when) => (Math.abs(when - at) < Math.abs(best - at) ? when : best),
        heard[0] ?? at,
      )
      const offset = at - nearest
      if (Math.abs(offset) > interval / 2) {
        return
      }
      offsets.push(offset)
      if (offsets.length >= wanted) {
        running = false
      }
      changed()
    },
  }
}
