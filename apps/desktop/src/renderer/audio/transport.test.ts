import { describe, expect, it } from 'vitest'

import { LOOK_AHEAD_SECONDS } from './scheduler'
import { FakeTime, Listener, note, performance } from './test-doubles'
import { START_LEAD_SECONDS, Transport } from './transport'

/** 120 bpm at 480 ticks to the quarter: 960 ticks a second. */
const TICKS_PER_SECOND = 960

function setup(notes = Array.from({ length: 16 }, (_, index) => note(60, index * 480))) {
  const time = new FakeTime()
  const engine = new Listener(time)
  const transport = new Transport(engine, time.clock, time.ticker)
  transport.load(performance(notes))
  return { time, engine, transport }
}

describe('Transport', () => {
  it('starts stopped at the beginning', () => {
    const { transport } = setup()
    expect(transport.status).toBe('stopped')
    expect(transport.position()).toBe(0)
  })

  it('reads its position from the audio clock while playing', () => {
    const { time, transport } = setup()
    transport.play()
    time.run(1 + START_LEAD_SECONDS)
    expect(transport.status).toBe('playing')
    expect(transport.position()).toBeCloseTo(TICKS_PER_SECOND, 6)
  })

  it('holds its position through a pause and resumes from exactly there', () => {
    const { time, engine, transport } = setup()
    transport.play()
    // Paused between two quarters, a quarter and a quarter in.
    time.run(1.25 + START_LEAD_SECONDS)
    transport.pause()
    const held = transport.position()
    expect(held).toBeCloseTo(1200, 6)
    time.run(5)
    expect(transport.status).toBe('paused')
    expect(transport.position()).toBe(held)

    const before = engine.heard.length
    transport.play()
    time.run(5.5)
    // The next strike is the quarter after the pause point, a quarter-second on.
    const next = engine.heard.slice(before).find((entry) => entry.call.startsWith('on'))
    expect(next?.at).toBeCloseTo(5 + START_LEAD_SECONDS + (1440 - held) / TICKS_PER_SECOND, 6)
  })

  it('stops back at the start, or at the loop start when there is a loop', () => {
    const { time, transport } = setup()
    transport.play()
    time.run(1)
    transport.stop()
    expect(transport.position()).toBe(0)

    transport.setLoop({ start: 1920, end: 3840 })
    transport.stop()
    expect(transport.status).toBe('stopped')
    expect(transport.position()).toBe(1920)
  })

  it('seeks while playing and carries on from there, with the pedals as they stand', () => {
    const { time, engine, transport } = setup([note(48, 0, 3840), note(60, 3840)])
    transport.load(
      performance([note(48, 0, 3840), note(60, 3840)], undefined, {
        expression: { pedals: [{ tick: 0, pedal: 'sustain', value: 127 }] },
      }),
    )
    transport.play()
    time.run(0.5)
    const before = engine.heard.length
    transport.seek(3840)
    time.run(0.6)
    expect(transport.position()).toBeCloseTo(3840 + (0.6 - 0.5 - START_LEAD_SECONDS) * 960, 6)
    time.run(1)
    expect(engine.heard.slice(before).map((entry) => entry.call)).toEqual([
      'pedal sustain 127',
      'on 60 80',
      'off 60',
    ])
  })

  it('moves the next notes, and releases each at the pitch it was struck at', () => {
    const { time, engine, transport } = setup([note(60, 0, 960), note(60, 960, 480)])
    transport.play()
    time.run(0.5)
    transport.setTranspose(2)
    time.run(2)
    expect(engine.heard.map((entry) => entry.call)).toEqual([
      'on 60 80',
      'off 60',
      'on 62 80',
      'off 62',
    ])
  })

  it('keeps transposition within two octaves either way', () => {
    const { transport } = setup()
    transport.setTranspose(40)
    expect(transport.transpose).toBe(24)
    transport.setTranspose(-3.4)
    expect(transport.transpose).toBe(-3)
  })

  it('composes seek, loop, tempo and transpose: each note sounds where the position says', () => {
    // Pitch 40 + n sits at tick 120 n, so any note says where it belongs.
    const notes = Array.from({ length: 32 }, (_, index) => note(40 + index, index * 120, 60))
    const time = new FakeTime()
    const misses: number[] = []
    let transport: Transport | null = null
    class Checking extends Listener {
      override noteOn(pitch: number, velocity: number, at: number): void {
        super.noteOn(pitch, velocity, at)
        const written = pitch - (transport?.transpose ?? 0)
        misses.push(Math.abs((transport?.tickAt(at) ?? NaN) - (written - 40) * 120))
      }
    }
    transport = new Transport(new Checking(time), time.clock, time.ticker)
    transport.load(performance(notes))

    transport.setLoop({ start: 480, end: 2880 })
    transport.setTempoScale(0.75)
    transport.setTranspose(-3)
    transport.play()
    time.run(1.2)
    transport.seek(1200)
    time.run(2.5)
    transport.setTempoScale(1.25)
    transport.setTranspose(5)
    time.run(6)
    transport.pause()
    transport.seek(240)
    transport.play()
    time.run(9)

    expect(misses.length).toBeGreaterThan(40)
    expect(Math.max(...misses)).toBeLessThan(1e-6)
    expect(transport.status).toBe('playing')
  })

  it('goes back to stopped at the end of the piece, and says so', () => {
    const { time, transport } = setup([note(60, 0, 480)])
    let told = 0
    transport.subscribe(() => {
      told += 1
    })
    transport.play()
    time.run(3)
    expect(transport.status).toBe('stopped')
    expect(transport.position()).toBe(0)
    // Once for play, once for the end.
    expect(told).toBe(2)
  })

  it('tells whoever is listening about every change a view would show', () => {
    const { transport } = setup()
    let told = 0
    const stop = transport.subscribe(() => {
      told += 1
    })
    transport.setTempoScale(0.8)
    transport.setTranspose(1)
    transport.setLoop({ start: 0, end: 960 })
    transport.seek(480)
    stop()
    transport.seek(0)
    expect(told).toBe(4)
    expect(transport.tempoScale).toBe(0.8)
    expect(transport.loop).toEqual({ start: 0, end: 960 })
  })
})

describe('the strikes a view draws', () => {
  it('hands over each strike with the time the engine was given', () => {
    const { time, engine, transport } = setup([note(60, 0), note(64, 480)])
    const seen: string[] = []
    transport.strikes.subscribe((strike) => {
      if (strike.kind === 'strike') {
        seen.push(`${String(strike.pitch)}@${String(Math.round(strike.at * 1e6) / 1e6)}`)
      }
    })
    transport.play()
    time.run(1)
    const struck = engine
      .times()
      .filter(([call]) => call.startsWith('on '))
      .map(([call, at]) => `${call.split(' ')[1] ?? ''}@${String(at)}`)
    expect(seen).toEqual(struck)
  })

  it('gives the written pitch, whatever the transposition plays', () => {
    const { time, engine, transport } = setup([note(60, 0)])
    const seen: number[] = []
    transport.strikes.subscribe((strike) => {
      if (strike.kind === 'strike') {
        seen.push(strike.pitch)
      }
    })
    transport.setTranspose(5)
    transport.play()
    time.run(0.5)
    expect(seen).toEqual([60])
    expect(engine.times().some(([call]) => call.startsWith('on 65'))).toBe(true)
  })

  it('says when what is scheduled will not sound, so a burst is not thrown for it', () => {
    const { time, transport } = setup()
    let silences = 0
    transport.strikes.subscribe((strike) => {
      if (strike.kind === 'silence') {
        silences += 1
      }
    })
    transport.play()
    time.run(0.2)
    transport.pause()
    expect(silences).toBe(1)
    transport.play()
    time.run(0.4)
    transport.stop()
    expect(silences).toBe(2)
  })

  it('lets a listener go, and says nothing more to it', () => {
    const { time, transport } = setup()
    let heard = 0
    const stop = transport.strikes.subscribe(() => {
      heard += 1
    })
    transport.play()
    time.run(0.3)
    const before = heard
    expect(before).toBeGreaterThan(0)
    stop()
    time.run(1)
    expect(heard).toBe(before)
  })

  it('offers the clock the strike times are on', () => {
    const { time, transport } = setup()
    time.now = 3.5
    expect(transport.strikes.now()).toBe(3.5)
  })
})

describe('muting a part while it plays', () => {
  /** A long left-hand note under a run of short right-hand ones. */
  function twoParts() {
    const time = new FakeTime()
    const engine = new Listener(time)
    const transport = new Transport(engine, time.clock, time.ticker)
    transport.load(
      performance([
        { pitch: 36, start: 0, duration: 1920, velocity: 64, part: 'left', hand: 'left' },
        ...Array.from({ length: 8 }, (_, index) => ({
          pitch: 72 + index,
          start: index * 240,
          duration: 220,
          velocity: 80,
          part: 'right',
          hand: 'right' as const,
        })),
      ]),
    )
    return { time, engine, transport }
  }

  it('takes effect at the next note and leaves the sounding one alone', () => {
    const { time, engine, transport } = twoParts()
    transport.play()
    time.run(0.5)
    const before = engine.heard.length
    const silencedBefore = engine.stopped
    expect(engine.times().some(([call]) => call.startsWith('on 36'))).toBe(true)

    transport.setFilter({ mutedParts: ['right'] })
    time.run(2.2)

    // Nothing was cut: the mute silenced nothing that was sounding, and the
    // long left note was released at its own time, two seconds after the
    // start lead, rather than at the mute.
    expect(engine.stopped).toBe(silencedBefore)
    expect(engine.heard.length).toBeGreaterThan(before)
    expect(engine.times()).toContainEqual(['off 36', 2.05])

    // The right hand stopped being struck. What was already inside the
    // scheduler's look-ahead still sounds, which is what "at the next note
    // scheduled" means; nothing beyond it does.
    const struck = engine.heard.filter((call) => call.call.startsWith('on 7'))
    expect(struck.some((call) => call.at < 0.5)).toBe(true)
    expect(struck.filter((call) => call.at > 0.5 + LOOK_AHEAD_SECONDS)).toEqual([])
  })

  it('releases a note struck before the mute, so nothing hangs', () => {
    const { time, engine, transport } = twoParts()
    transport.play()
    // Far enough in that a right-hand note is sounding.
    time.run(0.1)
    transport.setFilter({ mutedParts: ['right'] })
    time.run(2.5)

    const ons = engine.heard.filter((call) => call.call.startsWith('on ')).length
    const offs = engine.heard.filter((call) => call.call.startsWith('off ')).length
    expect(offs).toBe(ons)
  })

  it('hears a soloed part only, and puts the rest back when solo ends', () => {
    const { time, engine, transport } = twoParts()
    transport.setFilter({ soloParts: ['left'] })
    transport.play()
    time.run(1)
    expect(engine.heard.every((call) => !call.call.startsWith('on 7'))).toBe(true)

    transport.setFilter({})
    time.run(2)
    expect(engine.heard.some((call) => call.call.startsWith('on 7'))).toBe(true)
  })

  it('tells a view that what sounds has changed', () => {
    const { transport } = twoParts()
    let told = 0
    transport.subscribe(() => {
      told += 1
    })
    transport.setFilter({ mutedParts: ['left'] })
    expect(told).toBe(1)
    expect(transport.filter).toEqual({ mutedParts: ['left'] })
  })
})
