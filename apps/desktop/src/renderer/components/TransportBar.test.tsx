import { resolveTiming } from '@piano/score-format'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FakeTime, Listener, note, performance } from '../audio/test-doubles'
import type { KeysInput } from '../lib/keys-input'
import type { MidiInput } from '../lib/midi-input'
import { Transport } from '../audio/transport'
import { clockTime, TransportBar } from './TransportBar'

/**
 * The bar against a real transport on a clock the test moves.
 *
 * The claim worth testing is not that a button calls a method: it is that
 * what the bar shows came from the transport. So the tests change the
 * transport from underneath and expect the bar to follow.
 */

const timing = resolveTiming(undefined)
const QUARTER = timing.ticksPerQuarter
const notes = Array.from({ length: 8 }, (_, index) => note(60 + index, index * QUARTER))

function setup(over: Partial<React.ComponentProps<typeof TransportBar>> = {}) {
  const time = new FakeTime()
  const transport = new Transport(new Listener(time), time.clock, time.ticker)
  transport.load(performance(notes))
  const onLeadSeconds = vi.fn()
  const onEffects = vi.fn()
  const onFull = vi.fn()
  const onTheme = vi.fn()
  const onView = vi.fn()
  const onSheetZoom = vi.fn()
  render(
    <TransportBar
      transport={transport}
      timing={timing}
      lastTick={8 * QUARTER}
      leadSeconds={3}
      onLeadSeconds={onLeadSeconds}
      effects
      onEffects={onEffects}
      theme="dark"
      onTheme={onTheme}
      full={false}
      onFull={onFull}
      view="roll"
      onView={onView}
      sheetZoom={1}
      onSheetZoom={onSheetZoom}
      {...over}
    />,
  )
  return { time, transport, onLeadSeconds, onEffects, onFull, onTheme, onView, onSheetZoom }
}

describe('TransportBar', () => {
  it('shows play, and pause once the transport is playing', () => {
    const { transport } = setup()
    expect(screen.getByLabelText('Play (space)')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Play (space)'))
    expect(transport.status).toBe('playing')
    expect(screen.getByLabelText('Pause (space)')).toBeTruthy()
  })

  it('follows the transport when something else changes it', () => {
    const { transport } = setup()
    fireEvent.click(screen.getByLabelText('Play (space)'))
    expect(screen.getByLabelText('Pause (space)')).toBeTruthy()

    // The piece ends, or a menu stops it: nobody touched the button.
    act(() => {
      transport.stop()
    })
    expect(screen.getByLabelText('Play (space)')).toBeTruthy()
  })

  it('shows the tempo the transport settled on, not the one it was asked for', () => {
    const { transport } = setup()
    // Far past the bar's limit; the bar shows what took effect.
    act(() => {
      transport.setTempoScale(8)
    })
    expect(screen.getByTestId('Tempo').textContent).toBe('960 bpm')
    act(() => {
      transport.setTempoScale(0.5)
    })
    expect(screen.getByTestId('Tempo').textContent).toBe('60 bpm')
  })

  it('steps the tempo and the transposition, within what each allows', () => {
    const { transport } = setup()
    for (let press = 0; press < 30; press += 1) {
      fireEvent.click(screen.getByLabelText('Slower ([)'))
    }
    expect(transport.tempoScale).toBe(0.25)

    for (let press = 0; press < 20; press += 1) {
      fireEvent.click(screen.getByLabelText('Up a semitone'))
    }
    expect(transport.transpose).toBe(12)
    expect(screen.getByTestId('Transpose').textContent).toBe('+12')
  })

  it('turns a loop on and off, and remembers the one it had', () => {
    const { transport } = setup()
    act(() => {
      transport.setLoop({ start: 0, end: 4 * QUARTER })
    })
    fireEvent.click(screen.getByLabelText('Loop (L)'))
    expect(transport.loop).toBeNull()

    fireEvent.click(screen.getByLabelText('Loop (L)'))
    expect(transport.loop).toEqual({ start: 0, end: 4 * QUARTER })
  })

  it('counts the time from the score and the practice tempo', () => {
    const { transport } = setup()
    // Eight quarters at 120bpm is four seconds; at half speed, eight.
    expect(screen.getByTestId('elapsed').textContent).toBe('0:00 / 0:04')
    act(() => {
      transport.setTempoScale(0.5)
    })
    expect(screen.getByTestId('elapsed').textContent).toBe('0:00 / 0:08')
  })

  it('writes a clock the way a clock is written', () => {
    expect(clockTime(0)).toBe('0:00')
    expect(clockTime(9.7)).toBe('0:09')
    expect(clockTime(61)).toBe('1:01')
    expect(clockTime(-5)).toBe('0:00')
  })

  it('seeks where a scrub was let go, and does not snap back under it', () => {
    const { transport } = setup()
    const scrubber = screen.getByLabelText('Position in the piece')
    const thumb = scrubber.querySelector('[role="slider"]') ?? scrubber
    fireEvent.focus(thumb)
    // Radix moves the value by a step per arrow press.
    for (let press = 0; press < 5; press += 1) {
      fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    }
    expect(transport.position()).toBe(5)
    expect(thumb.getAttribute('aria-valuenow')).toBe('5')
  })

  it('offers the effects, theme and full screen to whoever owns them', () => {
    const { onEffects, onTheme, onFull } = setup()
    fireEvent.click(screen.getByLabelText('Effects'))
    expect(onEffects).toHaveBeenCalledWith(false)
    fireEvent.click(screen.getByLabelText('Switch to the light theme'))
    expect(onTheme).toHaveBeenCalledWith('light')
    fireEvent.click(screen.getByLabelText('Full screen'))
    expect(onFull).toHaveBeenCalledWith(true)
  })

  it('offers the stave while the roll is showing', () => {
    const { onView } = setup()
    const button = screen.getByLabelText('Show the sheet music')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)
    expect(onView).toHaveBeenCalledWith('sheet')
  })

  it('does not wear the MIDI monitor’s icon while the stave is showing', () => {
    // Both were Music4, two places apart in one row, so neither said which it
    // was. jsdom is enough: an icon is inline SVG in the document, and the
    // claim is about what is drawn rather than where it lands.
    const midi: MidiInput = {
      state: { status: 'ready', devices: [], chosen: null, detail: '' },
      subscribe: () => () => {},
      start: () => {},
      choose: () => {},
      onEvent: () => () => {},
    }
    const keys: KeysInput = {
      state: { playing: false, octave: 0, range: [48, 72], held: [] },
      subscribe: () => () => {},
      setPlaying: () => {},
      shiftOctave: () => {},
      onEvent: () => () => {},
      attach: () => () => {},
    }
    setup({ view: 'sheet', midi, keys })
    const glyph = (label: string) => screen.getByLabelText(label).querySelector('svg')?.innerHTML
    expect(glyph('Show the falling notes')).toBeTruthy()
    expect(glyph('MIDI input')).toBeTruthy()
    expect(glyph('Show the falling notes')).not.toBe(glyph('MIDI input'))
    // And it is not the typing keyboard's either, which sits beside them too.
    expect(glyph('Show the falling notes')).not.toBe(glyph('Play with the typing keyboard'))
  })

  it('offers the roll back while the stave is showing', () => {
    const { onView } = setup({ view: 'sheet' })
    const button = screen.getByLabelText('Show the falling notes')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(button)
    expect(onView).toHaveBeenCalledWith('roll')
  })
})

describe('playing from the keyboard alone', () => {
  let transport: Transport

  beforeEach(() => {
    transport = setup().transport
  })

  it('starts and stops on space', () => {
    fireEvent.keyDown(document, { key: ' ' })
    expect(transport.status).toBe('playing')
    fireEvent.keyDown(document, { key: ' ' })
    expect(transport.status).toBe('paused')
  })

  it('slows down and speeds up on the bracket keys', () => {
    fireEvent.keyDown(document, { key: '[' })
    expect(transport.tempoScale).toBe(0.95)
    fireEvent.keyDown(document, { key: ']' })
    fireEvent.keyDown(document, { key: ']' })
    expect(transport.tempoScale).toBe(1.05)
  })

  it('loops on L and goes back to the start on Home', () => {
    fireEvent.keyDown(document, { key: 'l' })
    expect(transport.loop).not.toBeNull()
    fireEvent.keyDown(document, { key: 'l' })
    expect(transport.loop).toBeNull()

    transport.seek(3 * QUARTER)
    fireEvent.keyDown(document, { key: 'Home' })
    expect(transport.position()).toBe(0)
  })

  it('leaves the letters the typing keyboard plays with alone', () => {
    transport.seek(3 * QUARTER)
    // R is F sharp on the Q row; it used to jump to the start.
    fireEvent.keyDown(document, { key: 'r' })
    expect(transport.position()).toBe(3 * QUARTER)
  })

  it('keeps its hands off a keystroke meant for a field', () => {
    const field = document.createElement('input')
    document.body.append(field)
    field.focus()
    fireEvent.keyDown(field, { key: ' ' })
    expect(transport.status).toBe('stopped')
    field.remove()
  })

  it('leaves a shortcut with a modifier to the browser', () => {
    fireEvent.keyDown(document, { key: ' ', ctrlKey: true })
    expect(transport.status).toBe('stopped')
  })
})
