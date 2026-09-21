import type { Note, PedalKind, Score, Timing } from '@piano/score-format'
import { resolveTiming } from '@piano/score-format'

import type { AudioTime, EngineKind, PianoEngine } from './engine'
import { WAKE_INTERVAL_MS, type Performance, type Ticker } from './scheduler'

/**
 * Stand-ins for the clock and the engine, shared by the scheduler's and the
 * transport's tests. Nothing in the app imports this.
 */

/** What the engine was told, and what the clock said when it was told. */
export type Heard = {
  readonly call: string
  readonly at: AudioTime
  readonly toldAt: AudioTime
}

/**
 * Synthetic time. The clock only moves when the test moves it, and each
 * wake-up fires when the test says, which is how lateness is simulated.
 */
export class FakeTime {
  now = 0
  private wake: (() => void) | null = null
  wakeUps = 0

  readonly clock = { now: () => this.now }

  readonly ticker: Ticker = (wake) => {
    this.wake = wake
    return () => {
      this.wake = null
    }
  }

  get ticking(): boolean {
    return this.wake !== null
  }

  /** Run the clock to `until`, waking every interval, each wake-up late by `lateness(n)` seconds. */
  run(until: AudioTime, lateness: (wakeUp: number) => number = () => 0): void {
    let next = this.now + WAKE_INTERVAL_MS / 1000
    while (next <= until && this.wake !== null) {
      const late = lateness(this.wakeUps)
      this.now = next + late
      this.wakeUps += 1
      this.wake()
      next += WAKE_INTERVAL_MS / 1000
      if (this.now > next) {
        next = this.now + WAKE_INTERVAL_MS / 1000
      }
    }
    this.now = Math.max(this.now, until)
  }
}

/** An engine that writes down every call it gets. */
export class Listener implements PianoEngine {
  readonly kind: EngineKind = 'synth'
  readonly heard: Heard[] = []
  stopped = 0

  constructor(private readonly time: FakeTime) {}

  prepare(_score: Score): Promise<void> {
    return Promise.resolve()
  }
  noteOn(pitch: number, velocity: number, at: AudioTime): void {
    this.heard.push({ call: `on ${String(pitch)} ${String(velocity)}`, at, toldAt: this.time.now })
  }
  noteOff(pitch: number, at: AudioTime): void {
    this.heard.push({ call: `off ${String(pitch)}`, at, toldAt: this.time.now })
  }
  pedal(pedal: PedalKind, value: number, at: AudioTime): void {
    this.heard.push({ call: `pedal ${pedal} ${String(value)}`, at, toldAt: this.time.now })
  }
  setMasterGain(): void {}
  stopAll(): void {
    this.stopped += 1
  }
  retire(): void {}

  /** When each call was scheduled for, rounded past float noise. */
  times(): [string, number][] {
    return this.heard.map((entry) => [entry.call, Math.round(entry.at * 1e6) / 1e6])
  }
}

export function note(pitch: number, start: number, duration = 240, velocity = 80): Note {
  return { pitch, start, duration, velocity }
}

export function performance(
  notes: Note[],
  timing?: Timing,
  extra: Partial<Performance> = {},
): Performance {
  return { timing: resolveTiming(timing), notes, ...extra }
}

/** A metronome voice that writes down every click, and every time it was silenced. */
export class ClickRecorder {
  readonly clicks: [number, boolean][] = []
  stopped = 0

  click(at: AudioTime, accent: boolean): void {
    this.clicks.push([Math.round(at * 1e6) / 1e6, accent])
  }

  stopAll(): void {
    this.stopped += 1
  }
}
