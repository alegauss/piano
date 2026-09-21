import { describe, expect, it } from 'vitest'

import { timelineOf } from './scheduler'
import { ClickRecorder, FakeTime, Listener, note, performance } from './test-doubles'
import { START_LEAD_SECONDS, Transport } from './transport'

/**
 * The metronome and the count-in, through the transport that plays them.
 *
 * At 120 bpm a quarter is half a second, which is what every time below is
 * counted in, from the transport's start lead.
 */

function setup(
  timeSignature: { numerator: number; denominator: number } = { numerator: 4, denominator: 4 },
) {
  const time = new FakeTime()
  const engine = new Listener(time)
  const clicks = new ClickRecorder()
  const transport = new Transport(engine, time.clock, time.ticker, clicks)
  const notes = Array.from({ length: 6 }, (_, index) => note(60, index * 480, 240))
  transport.load(performance(notes, { timeSignatures: [{ tick: 0, ...timeSignature }] }))
  return { time, engine, clicks, transport }
}

const at = (seconds: number) => Math.round((START_LEAD_SECONDS + seconds) * 1e6) / 1e6

describe('the metronome', () => {
  it('is off unless asked for, since it spoils listening', () => {
    const { time, clicks, transport } = setup()
    transport.play()
    time.run(3)
    expect(transport.metronome).toBe(false)
    expect(clicks.clicks).toEqual([])
  })

  it('clicks every beat on the notes clock, accenting each downbeat of the meter', () => {
    const { time, clicks, transport } = setup({ numerator: 3, denominator: 4 })
    transport.setMetronome(true)
    transport.play()
    time.run(3)
    expect(clicks.clicks).toEqual([
      [at(0), true],
      [at(0.5), false],
      [at(1), false],
      [at(1.5), true],
      [at(2), false],
      [at(2.5), false],
    ])
  })

  it('puts the clicks on the timeline only when asked, so the notes stay as they were', () => {
    const played = performance([note(60, 0, 1920)])
    expect(timelineOf(played).some((event) => event.kind === 'click')).toBe(false)
    const withBeats = timelineOf(played, { beats: true }).filter((event) => event.kind === 'click')
    expect(withBeats.map((event) => event.tick)).toEqual([0, 480, 960, 1440, 1920])
  })
})

describe('the count-in', () => {
  it('clicks a full bar at the practice tempo before the first note', () => {
    const { time, engine, clicks, transport } = setup()
    transport.setCountIn(true)
    transport.setTempoScale(0.5)
    transport.play()
    time.run(6)

    // Half speed: a beat is a second, and the piece starts four beats in.
    expect(clicks.clicks.slice(0, 4)).toEqual([
      [at(0), true],
      [at(1), false],
      [at(2), false],
      [at(3), false],
    ])
    const first = engine.heard.find((entry) => entry.call.startsWith('on'))
    expect(first?.at).toBeCloseTo(at(4), 9)
  })

  it('counts in the meter where playback starts', () => {
    const { time, clicks, transport } = setup({ numerator: 3, denominator: 4 })
    transport.setCountIn(true)
    transport.play()
    time.run(1)
    expect(clicks.clicks).toHaveLength(3)
  })

  it('is never scored: nothing sounds in it, and it says where the piece begins', () => {
    const { time, engine, transport } = setup()
    transport.setCountIn(true)
    transport.play()
    time.run(1)

    // Four beats at 120 bpm: the count-in runs for two seconds.
    expect(transport.isCountIn(at(1.99))).toBe(true)
    expect(transport.isCountIn(at(2))).toBe(false)
    expect(transport.position()).toBe(0)
    time.run(4)
    expect(engine.heard.every((entry) => !transport.isCountIn(entry.at))).toBe(true)
  })

  it('silences its clicks not yet sounded when playback is paused in it', () => {
    const { time, clicks, transport } = setup()
    transport.setCountIn(true)
    transport.play()
    time.run(0.7)
    transport.pause()
    expect(clicks.stopped).toBeGreaterThan(0)
    expect(transport.isCountIn(time.now)).toBe(false)
    expect(transport.position()).toBe(0)
  })

  it('is skipped by a seek while playing, which carries straight on', () => {
    const { time, engine, transport } = setup()
    transport.setCountIn(true)
    transport.play()
    time.run(3)
    const before = engine.heard.length
    transport.seek(960)
    time.run(3.2)
    const next = engine.heard.slice(before).find((entry) => entry.call.startsWith('on'))
    expect(next?.at).toBeCloseTo(3 + START_LEAD_SECONDS, 9)
  })

  it('needs a voice: without a clicker neither the metronome nor the count-in turns on', () => {
    const time = new FakeTime()
    const transport = new Transport(new Listener(time), time.clock, time.ticker)
    transport.setMetronome(true)
    transport.setCountIn(true)
    expect(transport.metronome).toBe(false)
    expect(transport.countIn).toBe(false)
  })
})
