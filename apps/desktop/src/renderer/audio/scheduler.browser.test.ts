import { resolveTiming, type Note } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import type { AudioTime, PianoEngine } from './engine'
import { Scheduler } from './scheduler'

/**
 * The same scheduler on real timers, in a real renderer's event loop.
 *
 * The fake-clock suite proves the arithmetic. This proves the premise: that a
 * setInterval wake-up in Chromium, held up by work on the main thread, still
 * hands every note over before it is due.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Hold the main thread, as a layout pass or a garbage collection would. */
function busy(ms: number): void {
  const until = performance.now() + ms
  while (performance.now() < until) {
    // spinning on purpose
  }
}

describe('the scheduler on real timers', () => {
  it('hands every note over on time while the main thread is busy', async () => {
    const clock = { now: (): AudioTime => performance.now() / 1000 }
    const handed: { at: AudioTime; toldAt: AudioTime }[] = []
    const record = (at: AudioTime) => {
      handed.push({ at, toldAt: clock.now() })
    }
    const engine: PianoEngine = {
      kind: 'synth',
      prepare: () => Promise.resolve(),
      noteOn: (_pitch, _velocity, at) => {
        record(at)
      },
      noteOff: (_pitch, at) => {
        record(at)
      },
      pedal: () => {},
      setMasterGain: () => {},
      stopAll: () => {},
      retire: () => {},
    }

    // Thirty notes, one every 50 ms at 120 bpm.
    const notes: Note[] = Array.from({ length: 30 }, (_, index) => ({
      pitch: 60 + (index % 12),
      start: index * 48,
      duration: 24,
      velocity: 80,
    }))
    const scheduler = new Scheduler(engine, clock)
    scheduler.load({ timing: resolveTiming(undefined), notes })
    scheduler.start(0, clock.now() + 0.05)

    for (let block = 0; block < 3; block += 1) {
      await sleep(300)
      busy(50)
    }
    await sleep(900)
    scheduler.stop()

    expect(handed).toHaveLength(60)
    // A few milliseconds is the tolerance a listener cannot hear; in practice
    // each note is handed over tens of milliseconds early.
    const late = handed.filter((entry) => entry.toldAt > entry.at + 0.003)
    expect(late).toEqual([])
  })
})
