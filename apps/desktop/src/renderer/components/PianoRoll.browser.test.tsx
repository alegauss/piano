import { render } from '@testing-library/react'
import { resolveTiming, type Note } from '@piano/score-format'
import { beforeEach, describe, expect, it } from 'vitest'

import type { StrikeEvent, StrikeSource } from '../audio'
import { FakeTime, Listener } from '../audio/test-doubles'
import { Transport } from '../audio/transport'
import { keyRect } from '../lib/keyboard-geometry'
import { PianoRoll } from './PianoRoll'

/**
 * The roll against a real transport on a clock the test moves by hand.
 *
 * Two claims need a real canvas and a real clock: that a note is drawn in its
 * key's column to the pixel, and that the field moves because the clock
 * moved, not because frames went by.
 */

const WIDTH = 1040
const HEIGHT = 400
const timing = resolveTiming(undefined)
const QUARTER = timing.ticksPerQuarter
const LEAD = 3

/** Wait for the draw loop to paint, whatever the browser's frame rate is. */
async function frames(count = 3) {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
}

function drawn(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('no 2d context')
  }
  const field = canvas.getBoundingClientRect()
  const ratio = canvas.width / field.width
  const background = context.getImageData(0, 0, 1, 1).data
  const isNote = (data: Uint8ClampedArray, at: number) =>
    data[at] !== background[0] || data[at + 1] !== background[1] || data[at + 2] !== background[2]

  return {
    /** The field's own height, which is the container less the keyboard. */
    height: field.height,
    /** The x range of note pixels across a row, in CSS pixels. */
    spanAt(y: number): { left: number; right: number } | null {
      const row = context.getImageData(0, Math.round(y * ratio), canvas.width, 1).data
      let left: number | null = null
      let right = 0
      for (let x = 0; x < canvas.width; x += 1) {
        if (isNote(row, x * 4)) {
          left ??= x
          right = x
        }
      }
      return left === null ? null : { left: left / ratio, right: (right + 1) / ratio }
    },
    /** The topmost row holding a note pixel, in CSS pixels. */
    top(): number | null {
      const all = context.getImageData(0, 0, canvas.width, canvas.height).data
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          if (isNote(all, (y * canvas.width + x) * 4)) {
            return y / ratio
          }
        }
      }
      return null
    },
  }
}

/**
 * Particles and the key flash are drawn near white, where notes are coloured
 * and the field is dark, so counting bright pixels counts the effect.
 */
function bright(canvas: HTMLCanvasElement): number {
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('no 2d context')
  }
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data
  let count = 0
  for (let at = 0; at < data.length; at += 4) {
    if ((data[at] ?? 0) > 200 && (data[at + 1] ?? 0) > 200 && (data[at + 2] ?? 0) > 200) {
      count += 1
    }
  }
  return count
}

function mount(
  notes: readonly Note[],
  transport: Transport,
  effects: { strikes?: StrikeSource; effects?: boolean } = {},
) {
  const { container } = render(
    <div style={{ width: WIDTH, height: HEIGHT }}>
      <PianoRoll
        timing={timing}
        notes={notes}
        position={() => transport.position()}
        tempoScale={() => transport.tempoScale}
        leadSeconds={LEAD}
        strikes={effects.strikes}
        effects={effects.effects}
        className="h-full"
      />
    </div>,
  )
  const canvas = container.querySelector('canvas')
  if (canvas === null) {
    throw new Error('no canvas')
  }
  return { canvas, container }
}

describe('PianoRoll, drawing', () => {
  let time: FakeTime
  let transport: Transport

  beforeEach(() => {
    time = new FakeTime()
    transport = new Transport(new Listener(time), time.clock, time.ticker)
  })

  it('draws a note in its own key’s column, to the pixel', async () => {
    const notes = [{ pitch: 61, start: QUARTER, duration: QUARTER, velocity: 80 }]
    transport.load({ timing, notes })
    const { canvas } = mount(notes, transport)
    await frames()

    const key = keyRect(61, WIDTH)
    const field = drawn(canvas)
    // A row inside the note, found from where it was actually drawn.
    const span = field.spanAt((field.top() ?? 0) + 5)
    expect(span).not.toBeNull()
    // A pixel and a half of slack: an edge at a fraction of a pixel is drawn
    // across the pixel either side of it.
    expect(Math.abs((span?.left ?? 0) - (key?.x ?? 0))).toBeLessThanOrEqual(1.5)
    expect(Math.abs((span?.right ?? 0) - ((key?.x ?? 0) + (key?.width ?? 0)))).toBeLessThanOrEqual(
      1.5,
    )
  })

  it('moves the field because the clock moved, not because frames went by', async () => {
    const notes = [{ pitch: 60, start: 4 * QUARTER, duration: QUARTER, velocity: 80 }]
    transport.load({ timing, notes })
    const { canvas } = mount(notes, transport)
    transport.play()
    // Past the start lead, so the mapping is under way.
    time.run(0.5)
    await frames()
    const before = drawn(canvas).top()
    expect(before).not.toBeNull()

    // Thirty frames with the clock held still: a frame-driven roll slides here.
    await frames(30)
    expect(drawn(canvas).top()).toBe(before)

    // Half a second on the audio clock is a sixth of a three-second field.
    time.run(1)
    await frames()
    const after = drawn(canvas).top() ?? 0
    expect(after - (before ?? 0)).toBeCloseTo(drawn(canvas).height / 6, 0)
  })

  it('throws a burst when a note reaches the keyboard, and lets it die', async () => {
    const notes = [{ pitch: 60, start: QUARTER, duration: QUARTER, velocity: 110 }]
    transport.load({ timing, notes })
    const { canvas } = mount(notes, transport, { strikes: transport.strikes })
    transport.play()

    // Before the note sounds: notes on the field, nothing struck.
    time.run(0.2)
    await frames()
    expect(bright(canvas)).toBe(0)

    // The note sounds half a second in.
    time.run(0.6)
    await frames()
    expect(bright(canvas)).toBeGreaterThan(0)

    time.run(2)
    await frames()
    expect(bright(canvas)).toBe(0)
  })

  it('draws nothing and asks for nothing when effects are off', async () => {
    const notes = [{ pitch: 60, start: QUARTER, duration: QUARTER, velocity: 110 }]
    transport.load({ timing, notes })
    let subscribed = 0
    const counted = {
      now: () => transport.strikes.now(),
      subscribe: (listener: (strike: StrikeEvent) => void) => {
        subscribed += 1
        return transport.strikes.subscribe(listener)
      },
    }
    const { canvas } = mount(notes, transport, { strikes: counted, effects: false })
    transport.play()
    time.run(0.8)
    await frames()

    expect(subscribed).toBe(0)
    expect(bright(canvas)).toBe(0)
  })

  it('reports what a frame is costing, for anyone watching it', async () => {
    const notes = [{ pitch: 60, start: 0, duration: 2 * QUARTER, velocity: 80 }]
    transport.load({ timing, notes })
    const { container } = mount(notes, transport)
    // The overlay speaks twice a second, so this waits rather than counting frames.
    await new Promise((resolve) => setTimeout(resolve, 700))
    const meter = container.querySelector('[data-testid="frame-meter"]')
    expect(meter?.textContent).toMatch(/^\d+\.\d ms · worst \d+\.\d ms$/)
  })

  it('follows the window: the backing store tracks the box it is given', async () => {
    const notes = [{ pitch: 60, start: 0, duration: QUARTER, velocity: 80 }]
    transport.load({ timing, notes })
    const { canvas, container } = mount(notes, transport)
    await frames()
    const before = canvas.width
    const outer = container.firstElementChild as HTMLElement
    outer.style.width = '600px'
    // A ResizeObserver reports after layout, so the next frames pick it up.
    await frames(5)
    expect(canvas.width).toBeLessThan(before)
    expect(canvas.width / canvas.getBoundingClientRect().width).toBeCloseTo(
      Math.min(window.devicePixelRatio, 2),
      1,
    )
  })

  it('lights the key a note is sounding on, and puts it out at the release', async () => {
    // A note far ahead keeps the piece going, so the release is a release
    // rather than the transport reaching the end and rewinding to the start.
    const notes = [
      { pitch: 60, start: 0, duration: 2 * QUARTER, velocity: 80 },
      { pitch: 72, start: 40 * QUARTER, duration: QUARTER, velocity: 80 },
    ]
    transport.load({ timing, notes })
    const { container } = mount(notes, transport)
    transport.play()
    time.run(0.5)
    await frames()
    const key = () => container.querySelector('[data-pitch="60"]')
    expect(key()?.getAttribute('data-state')).toBe('sounding')

    time.run(1.5)
    await frames()
    expect(key()?.getAttribute('data-state')).toBe('idle')
  })
})
