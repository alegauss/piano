import { describe, expect, it } from 'vitest'

import { FRAME_BUDGET_MS, FrameTimes } from './frame-timing'

describe('FrameTimes', () => {
  it('says nothing before it has been told anything', () => {
    const times = new FrameTimes()
    expect(times.count).toBe(0)
    expect(times.percentile(0.95)).toBe(0)
    expect(times.worst).toBe(0)
  })

  it('reports a percentile of what it holds', () => {
    const times = new FrameTimes()
    for (let ms = 1; ms <= 100; ms += 1) {
      times.record(ms)
    }
    expect(times.percentile(0.5)).toBe(50)
    expect(times.percentile(0.95)).toBe(95)
    expect(times.worst).toBe(100)
  })

  it('keeps the recent frames and forgets the rest, so a bad start stops counting', () => {
    const times = new FrameTimes()
    times.record(1000)
    for (let frame = 0; frame < 200; frame += 1) {
      times.record(4)
    }
    expect(times.count).toBe(120)
    expect(times.worst).toBe(4)
  })

  it('forgets everything on a reset', () => {
    const times = new FrameTimes()
    times.record(9)
    times.reset()
    expect(times.count).toBe(0)
    expect(times.worst).toBe(0)
  })

  it('knows what sixty frames a second leaves a frame', () => {
    expect(FRAME_BUDGET_MS).toBeCloseTo(16.67, 2)
  })
})
