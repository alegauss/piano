import { beforeEach, describe, expect, it } from 'vitest'

import {
  calibrationKey,
  createCalibrator,
  heardAt,
  median,
  milliseconds,
  NO_LATENCY,
  outputLatencyOf,
  saveInputLatency,
  savedInputLatency,
  spread,
  struckAt,
  suspicious,
  SUSPICIOUS_SECONDS,
} from './latency'

describe('what the platform reports', () => {
  it('takes the output latency it is given', () => {
    expect(outputLatencyOf({ outputLatency: 0.02, baseLatency: 0.005 })).toBeCloseTo(0.02, 6)
  })

  it('falls back to the base latency, and never claims a machine is instant', () => {
    expect(outputLatencyOf({ outputLatency: 0, baseLatency: 0.04 })).toBeCloseTo(0.04, 6)
    expect(outputLatencyOf({ outputLatency: 0, baseLatency: 0 })).toBeGreaterThan(0)
  })
})

describe('the middle of a dozen strikes', () => {
  it('is the median, not the mean, so one mistimed strike does not drag it', () => {
    const strikes = [0.03, 0.031, 0.029, 0.032, 0.03, 0.5]
    expect(median(strikes)).toBeCloseTo(0.0305, 4)
    const mean = strikes.reduce((sum, value) => sum + value, 0) / strikes.length
    expect(mean).toBeGreaterThan(0.1)
  })

  it('handles an odd count and an empty one', () => {
    expect(median([1, 2, 3])).toBe(2)
    expect(median([])).toBe(0)
  })

  it('says how scattered the strikes were', () => {
    expect(spread([0.03, 0.03, 0.03])).toBe(0)
    expect(spread([0, 0.1, 0.2])).toBeCloseTo(0.1, 6)
  })

  it('calls an absurd figure absurd', () => {
    expect(suspicious(0.04)).toBe(false)
    expect(suspicious(SUSPICIOUS_SECONDS + 0.01)).toBe(true)
    expect(suspicious(-0.4)).toBe(true)
  })
})

describe('subtracting the lag', () => {
  const latency = { output: 0.02, input: 0.03 }

  it('puts a scheduled note where it is heard', () => {
    expect(heardAt(10, latency)).toBeCloseTo(10.02, 6)
  })

  it('puts a strike back where the key went down', () => {
    expect(struckAt(10, latency)).toBeCloseTo(9.97, 6)
  })

  it('leaves both alone when nothing has been measured', () => {
    expect(heardAt(10, NO_LATENCY)).toBe(10)
    expect(struckAt(10, NO_LATENCY)).toBe(10)
  })

  it('makes a player who was perfectly in time judged as in time', () => {
    // The note is scheduled for 10 and heard at 10.02. A player who strikes
    // exactly then produces an event at 10.05, because input takes 0.03.
    const played = struckAt(10.05, latency)
    expect(played - heardAt(10, latency)).toBeCloseTo(0, 6)
  })

  it('writes a figure a person can read', () => {
    expect(milliseconds(0.0304)).toBe('30 ms')
  })
})

describe('remembering a calibration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('keeps one figure per device and per output', () => {
    const headset = calibrationKey('Digital Piano', 'Bluetooth headset')
    const speakers = calibrationKey('Digital Piano', 'default')
    expect(headset).not.toBe(speakers)

    saveInputLatency(headset, 0.12)
    saveInputLatency(speakers, 0.03)
    expect(savedInputLatency(headset)).toBeCloseTo(0.12, 6)
    expect(savedInputLatency(speakers)).toBeCloseTo(0.03, 6)
  })

  it('has nothing to say about a setup it has never seen', () => {
    expect(savedInputLatency(calibrationKey('Other', null))).toBeNull()
  })

  it('treats rubbish in storage as nothing measured', () => {
    const key = calibrationKey(null, null)
    localStorage.setItem(key, 'not a number')
    expect(savedInputLatency(key)).toBeNull()
  })
})

describe('the calibration routine', () => {
  function setup(strikes = 4) {
    const clicks: number[] = []
    let stopped = 0
    let now = 100
    const calibrator = createCalibrator(
      {
        click: (at) => clicks.push(at),
        stopAll: () => {
          stopped += 1
        },
      },
      () => now,
      { strikes, interval: 1, latency: { output: 0.02, input: 0 } },
    )
    return {
      calibrator,
      clicks,
      get stopped() {
        return stopped
      },
      at: (time: number) => {
        now = time
      },
    }
  }

  it('clicks once more than it measures, since nobody is in time with the first sound', () => {
    const { calibrator, clicks } = setup(4)
    calibrator.start()
    expect(clicks).toEqual([101, 102, 103, 104, 105])
  })

  it('measures the median offset from the clicks as they were heard', () => {
    const { calibrator } = setup(4)
    calibrator.start()
    // The clicks to answer are heard at 102.02, 103.02, 104.02, 105.02, and
    // this player is 30ms late every time.
    for (const heard of [102.02, 103.02, 104.02, 105.02]) {
      calibrator.strike(heard + 0.03)
    }
    expect(calibrator.state.offset).toBeCloseTo(0.03, 6)
    expect(calibrator.state.taken).toBe(4)
    expect(calibrator.state.running).toBe(false)
  })

  it('counts an early strike against the click it meant, as a negative offset', () => {
    const { calibrator } = setup(4)
    calibrator.start()
    // Twenty milliseconds before each click was heard, not late for the one
    // before it.
    calibrator.strike(102.0)
    calibrator.strike(103.0)
    expect(calibrator.state.offset).toBeCloseTo(-0.02, 6)
  })

  it('lets early and late strikes cancel, which is what a median is for', () => {
    const { calibrator } = setup(4)
    calibrator.start()
    calibrator.strike(102.0)
    calibrator.strike(103.04)
    calibrator.strike(104.02)
    calibrator.strike(105.02)
    expect(calibrator.state.offset).toBeCloseTo(0, 6)
  })

  it('ignores a strike outside the run of clicks altogether', () => {
    const { calibrator } = setup(4)
    calibrator.start()
    calibrator.strike(108)
    calibrator.strike(99)
    expect(calibrator.state.taken).toBe(0)
  })

  it('says nothing until it has enough strikes to mean something', () => {
    const { calibrator } = setup(4)
    calibrator.start()
    calibrator.strike(102.05)
    expect(calibrator.state.offset).toBeNull()
    calibrator.strike(103.05)
    expect(calibrator.state.offset).not.toBeNull()
  })

  it('flags a figure that means a broken driver rather than a slow player', () => {
    const { calibrator } = setup(4)
    calibrator.start()
    for (const heard of [102.02, 103.02, 104.02, 105.02]) {
      calibrator.strike(heard + 0.3)
    }
    expect(calibrator.state.suspicious).toBe(true)
  })

  it('takes nothing once it is abandoned, and silences the clicks it had queued', () => {
    const { calibrator, stopped } = setup(4)
    calibrator.start()
    calibrator.stop()
    calibrator.strike(102.02)
    expect(calibrator.state.taken).toBe(0)
    expect(stopped).toBe(0)
    expect(calibrator.state.running).toBe(false)
  })
})
