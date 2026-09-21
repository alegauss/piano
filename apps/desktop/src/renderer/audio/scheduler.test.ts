import { describe, expect, it } from 'vitest'

import {
  LOOK_AHEAD_SECONDS,
  Scheduler,
  timelineOf,
  type LoopRange,
  type Performance,
} from './scheduler'
import { FakeTime, Listener, note, performance } from './test-doubles'

function setup(played: Performance) {
  const time = new FakeTime()
  const engine = new Listener(time)
  const scheduler = new Scheduler(engine, time.clock, time.ticker)
  scheduler.load(played)
  return { time, engine, scheduler }
}

describe('timelineOf', () => {
  it('orders releases before pedals before strikes within a tick', () => {
    const events = timelineOf(
      performance([note(60, 0, 480), note(60, 480, 480)], undefined, {
        expression: { pedals: [{ tick: 480, pedal: 'sustain', value: 127 }] },
      }),
    )
    expect(events.filter((event) => event.tick === 480).map((event) => event.kind)).toEqual([
      'off',
      'pedal',
      'on',
    ])
  })

  it('takes notes as they sound, with articulation and dynamics applied', () => {
    const events = timelineOf(
      performance([{ ...note(60, 0, 480, 100), articulation: 'staccato' }], undefined, {
        expression: { dynamics: [{ tick: 0, level: 'p' }] },
      }),
    )
    expect(events).toEqual([
      { tick: 0, kind: 'on', pitch: 60, velocity: 68 },
      { tick: 240, kind: 'off', pitch: 60, struck: 0 },
    ])
  })
})

describe('Scheduler', () => {
  it('puts every event at the audio time its tick maps to', () => {
    // 120 bpm at 480 ticks to the quarter: a quarter is half a second.
    const { time, engine, scheduler } = setup(performance([note(60, 0), note(64, 480)]))
    scheduler.start(0, 2)
    time.run(4)
    expect(engine.times()).toEqual([
      ['on 60 80', 2],
      ['off 60', 2.25],
      ['on 64 80', 2.5],
      ['off 64', 2.75],
    ])
  })

  it('hands each event over before its time, and never more than the look-ahead early', () => {
    const notes = Array.from({ length: 40 }, (_, index) => note(60 + (index % 12), index * 120, 60))
    const { time, engine, scheduler } = setup(performance(notes))
    scheduler.start(0, 0)
    time.run(6)
    expect(engine.heard).toHaveLength(80)
    for (const entry of engine.heard) {
      const lead = entry.at - entry.toldAt
      expect(lead).toBeGreaterThanOrEqual(0)
      expect(lead).toBeLessThanOrEqual(LOOK_AHEAD_SECONDS + 1e-9)
    }
  })

  it('keeps every onset exact when the wake-ups are late', () => {
    // A busy main thread: every wake-up late by up to 70 ms, which is within
    // what the look-ahead covers.
    const notes = Array.from({ length: 60 }, (_, index) => note(48 + (index % 24), index * 96, 48))
    const { time, engine, scheduler } = setup(performance(notes))
    scheduler.start(0, 0)
    const lateness = (wakeUp: number) => ((wakeUp * 37) % 71) / 1000
    time.run(8, lateness)

    expect(engine.heard).toHaveLength(120)
    for (const entry of engine.heard) {
      expect(entry.toldAt, `${entry.call} was handed over after its time`).toBeLessThanOrEqual(
        entry.at,
      )
    }
    const onsets = engine.heard.filter((entry) => entry.call.startsWith('on'))
    onsets.forEach((entry, index) => {
      expect(entry.at).toBeCloseTo(index * 0.1, 9)
    })
  })

  it('lands a chord as one event, even after a stall longer than the look-ahead', () => {
    const chord = [note(60, 960), note(64, 960), note(67, 960)]
    const { time, engine, scheduler } = setup(performance(chord))
    scheduler.start(0, 0)
    // Nothing wakes until well after the chord was due.
    time.run(1.5, (wakeUp) => (wakeUp === 0 ? 1.3 : 0))
    const strikes = engine.heard.filter((entry) => entry.call.startsWith('on'))
    expect(strikes).toHaveLength(3)
    expect(new Set(strikes.map((entry) => entry.at)).size).toBe(1)
    expect(new Set(strikes.map((entry) => entry.toldAt)).size).toBe(1)
  })

  it('follows the tempo map across a change', () => {
    const { time, engine, scheduler } = setup(
      performance([note(60, 1920), note(62, 3840)], {
        tempo: [
          { tick: 0, microsecondsPerQuarter: 500_000 },
          { tick: 1920, microsecondsPerQuarter: 250_000 },
        ],
      }),
    )
    scheduler.start(0, 0)
    time.run(4)
    // One bar at 120 bpm is two seconds; the next bar at 240 bpm is one.
    expect(engine.times().filter(([call]) => call.startsWith('on'))).toEqual([
      ['on 60 80', 2],
      ['on 62 80', 3],
    ])
  })

  it('plays slower at a lower tempo scale', () => {
    const { time, engine, scheduler } = setup(performance([note(60, 0), note(62, 480)]))
    scheduler.setTempoScale(0.5)
    scheduler.start(0, 0)
    time.run(3)
    expect(engine.times().filter(([call]) => call.startsWith('on'))).toEqual([
      ['on 60 80', 0],
      ['on 62 80', 1],
    ])
  })

  it('changes tempo while playing without moving what is already scheduled', () => {
    const notes = Array.from({ length: 8 }, (_, index) => note(60, index * 480, 240))
    const { time, engine, scheduler } = setup(performance(notes))
    scheduler.start(0, 0)
    time.run(1.2)
    const before = engine.times()
    scheduler.setTempoScale(0.5)
    time.run(10)

    // Nothing handed over before the change was moved by it.
    expect(engine.times().slice(0, before.length)).toEqual(before)
    // After the change the quarters are a second apart, not half a second.
    const onsets = engine.heard.filter((entry) => entry.call.startsWith('on')).map((e) => e.at)
    const gaps = onsets.slice(1).map((at, index) => at - (onsets[index] ?? 0))
    expect(gaps.at(-1)).toBeCloseTo(1, 9)
    // And the tick under the clock never jumps backwards across the change.
    expect(scheduler.tickAt(time.now)).toBeGreaterThan(scheduler.tickAt(1.2))
  })

  it('starts partway through with the pedals as they stand there', () => {
    const { time, engine, scheduler } = setup(
      performance([note(48, 0, 1920), note(60, 1920)], undefined, {
        expression: {
          pedals: [
            { tick: 0, pedal: 'sustain', value: 127 },
            { tick: 3840, pedal: 'sustain', value: 0 },
          ],
        },
      }),
    )
    scheduler.start(1920, 5)
    time.run(10)
    expect(engine.times()).toEqual([
      ['pedal sustain 127', 5],
      ['on 60 80', 5],
      ['off 60', 5.25],
      ['pedal sustain 0', 7],
    ])
  })

  it('reports the tick sounding at a time, which is what the roll draws', () => {
    const { scheduler } = setup(performance([note(60, 0, 1920)]))
    scheduler.start(480, 10)
    expect(scheduler.tickAt(10)).toBe(480)
    expect(scheduler.tickAt(10.5)).toBeCloseTo(960, 9)
    expect(scheduler.timeAt(960)).toBeCloseTo(10.5, 9)
  })

  it('stops, silences the engine, stops waking, and says where it stopped', () => {
    const { time, engine, scheduler } = setup(performance([note(60, 0), note(62, 4800)]))
    scheduler.start(0, 0)
    time.run(1)
    const stoppedAt = scheduler.stop()
    expect(stoppedAt).toBeCloseTo(960, 6)
    expect(engine.stopped).toBeGreaterThan(0)
    expect(time.ticking).toBe(false)
    expect(scheduler.stop()).toBeCloseTo(960, 6)
  })

  it('stops waking once everything has been handed over', () => {
    const { time, engine, scheduler } = setup(performance([note(60, 0)]))
    scheduler.start(0, 0)
    time.run(1)
    expect(engine.heard).toHaveLength(2)
    expect(scheduler.finished).toBe(true)
    expect(time.ticking).toBe(false)
  })
})

describe('Scheduler loops', () => {
  const loop: LoopRange = { start: 960, end: 1920 }
  const onsets = (engine: Listener) => engine.times().filter(([call]) => call.startsWith('on'))

  it('repeats a stretch with every note at its exact time', () => {
    const notes = Array.from({ length: 8 }, (_, index) => note(60 + index, index * 480))
    const { time, engine, scheduler } = setup(performance(notes))
    scheduler.setLoop(loop)
    scheduler.start(0, 0)
    time.run(4.2)
    expect(onsets(engine)).toEqual([
      ['on 60 80', 0],
      ['on 61 80', 0.5],
      ['on 62 80', 1],
      ['on 63 80', 1.5],
      ['on 62 80', 2],
      ['on 63 80', 2.5],
      ['on 62 80', 3],
      ['on 63 80', 3.5],
      ['on 62 80', 4],
    ])
  })

  it('lets go of a note still sounding when the loop jumps back, at the moment it jumps', () => {
    const { time, engine, scheduler } = setup(performance([note(60, 960, 1920)]))
    scheduler.setLoop(loop)
    scheduler.start(960, 0)
    time.run(1.2)
    expect(engine.times()).toEqual([
      ['on 60 80', 0],
      ['off 60', 1],
      ['on 60 80', 1],
    ])
  })

  it('puts the pedals back as they stand at the loop start', () => {
    const { time, engine, scheduler } = setup(
      performance([note(60, 960)], undefined, {
        expression: { pedals: [{ tick: 1440, pedal: 'sustain', value: 127 }] },
      }),
    )
    scheduler.setLoop(loop)
    scheduler.start(960, 0)
    time.run(1.2)
    expect(engine.times().filter(([call]) => call.startsWith('pedal'))).toEqual([
      ['pedal sustain 127', 0.5],
      ['pedal sustain 0', 1],
    ])
  })

  it('plays on through a loop whose end it started after', () => {
    const { time, engine, scheduler } = setup(performance([note(60, 2400), note(62, 2880)]))
    scheduler.setLoop(loop)
    scheduler.start(2400, 0)
    time.run(2)
    expect(onsets(engine).map(([call]) => call)).toEqual(['on 60 80', 'on 62 80'])
  })

  it('reports the tick sounding at every note, across loops and a change of tempo', () => {
    // Pitch 30 + n sits at tick 120 n, so any note says where it belongs.
    const notes = Array.from({ length: 24 }, (_, index) => note(30 + index, index * 120, 60))
    const time = new FakeTime()
    const misses: number[] = []
    let scheduler: Scheduler | null = null
    class Checking extends Listener {
      override noteOn(pitch: number, velocity: number, at: number): void {
        super.noteOn(pitch, velocity, at)
        misses.push(Math.abs((scheduler?.tickAt(at) ?? NaN) - (pitch - 30) * 120))
      }
    }
    scheduler = new Scheduler(new Checking(time), time.clock, time.ticker)
    scheduler.load(performance(notes))
    scheduler.setLoop({ start: 480, end: 2400 })
    scheduler.start(0, 0)
    time.run(1.3)
    scheduler.setTempoScale(0.5)
    time.run(4)
    scheduler.setTempoScale(1.5)
    time.run(9)

    expect(misses.length).toBeGreaterThan(40)
    expect(Math.max(...misses)).toBeLessThan(1e-6)
  })

  it('says once that the piece has ended, when the clock passes its last note', () => {
    let ended = 0
    const time = new FakeTime()
    const scheduler = new Scheduler(new Listener(time), time.clock, time.ticker, () => {
      ended += 1
    })
    scheduler.load(performance([note(60, 0, 480)]))
    scheduler.start(0, 0)
    time.run(0.4)
    expect(ended).toBe(0)
    time.run(2)
    expect(ended).toBe(1)
    expect(time.ticking).toBe(false)
  })

  it('never ends while it loops', () => {
    let ended = 0
    const time = new FakeTime()
    const scheduler = new Scheduler(new Listener(time), time.clock, time.ticker, () => {
      ended += 1
    })
    scheduler.load(performance([note(60, 960)]))
    scheduler.setLoop(loop)
    scheduler.start(960, 0)
    time.run(10)
    expect(ended).toBe(0)
    expect(time.ticking).toBe(true)
  })
})
