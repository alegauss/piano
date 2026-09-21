import { describe, expect, it } from 'vitest'

import { playLive } from './live-play'

function recorder() {
  const calls: string[] = []
  return {
    calls,
    engine: {
      noteOn: (pitch: number, velocity: number, at: number) => {
        calls.push(`on ${String(pitch)} ${String(velocity)} @${String(at)}`)
      },
      noteOff: (pitch: number, at: number) => {
        calls.push(`off ${String(pitch)} @${String(at)}`)
      },
      pedal: (pedal: string, value: number, at: number) => {
        calls.push(`pedal ${pedal} ${String(value)} @${String(at)}`)
      },
    },
  }
}

describe('playing by hand', () => {
  it('sounds a note now, since it has already been played', () => {
    const { engine, calls } = recorder()
    playLive(engine, () => 12.5, { kind: 'on', pitch: 60, velocity: 90 })
    expect(calls).toEqual(['on 60 90 @12.5'])
  })

  it('releases and pedals by the same path', () => {
    const { engine, calls } = recorder()
    playLive(engine, () => 1, { kind: 'off', pitch: 60 })
    playLive(engine, () => 2, { kind: 'pedal', pedal: 'sustain', value: 127 })
    expect(calls).toEqual(['off 60 @1', 'pedal sustain 127 @2'])
  })

  it('leaves a message it cannot name to the monitor', () => {
    const { engine, calls } = recorder()
    playLive(engine, () => 1, { kind: 'other', status: 0xe0, data: [0xe0, 0, 64] })
    expect(calls).toEqual([])
  })
})
