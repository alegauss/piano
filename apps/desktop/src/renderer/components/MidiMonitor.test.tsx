import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { MidiEvent } from '../lib/midi'
import type { MidiInput, MidiState } from '../lib/midi-input'
import { MidiMonitor } from './MidiMonitor'

/** A stand-in input whose state and events the test controls. */
function fake(state: Partial<MidiState> = {}) {
  let current: MidiState = {
    status: 'ready',
    devices: [{ id: 'a', name: 'Digital Piano', connected: true }],
    chosen: 'a',
    detail: '',
    ...state,
  }
  const listeners = new Set<() => void>()
  const events = new Set<(event: MidiEvent, raw: readonly number[]) => void>()
  let started = 0
  const chosen: string[] = []

  const input: MidiInput = {
    get state() {
      return current
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start: () => {
      started += 1
    },
    choose: (id) => {
      chosen.push(id)
      current = { ...current, chosen: id }
      for (const listener of listeners) listener()
    },
    onEvent: (listener) => {
      events.add(listener)
      return () => events.delete(listener)
    },
  }

  return {
    input,
    chosen,
    get started() {
      return started
    },
    /** Wrapped in act, since a controller sending a note is React state changing. */
    send: (event: MidiEvent, raw: readonly number[]) => {
      act(() => {
        for (const listener of events) listener(event, raw)
      })
    },
  }
}

async function open(input: MidiInput) {
  render(<MidiMonitor midi={input} />)
  fireEvent.click(screen.getByLabelText('MIDI input'))
  // The popover mounts its content on the next tick.
  await screen.findByText('MIDI input', { selector: 'h2' })
}

describe('MidiMonitor', () => {
  it('starts looking for a keyboard as soon as it is on screen', () => {
    const harness = fake()
    render(<MidiMonitor midi={harness.input} />)
    expect(harness.started).toBe(1)
  })

  it('lists the devices and chooses the one that is clicked', async () => {
    const harness = fake({
      devices: [
        { id: 'a', name: 'Digital Piano', connected: true },
        { id: 'b', name: 'Drum Pad', connected: true },
      ],
      chosen: 'a',
    })
    await open(harness.input)

    expect(screen.getByText('Digital Piano')).toBeTruthy()
    fireEvent.click(screen.getByText('Drum Pad'))
    expect(harness.chosen).toEqual(['b'])
  })

  it('shows what a controller is sending, newest first, in words and in bytes', async () => {
    const harness = fake()
    await open(harness.input)
    harness.send({ kind: 'on', pitch: 60, velocity: 90 }, [0x90, 60, 90])
    harness.send({ kind: 'pedal', pedal: 'sustain', value: 127 }, [0xb0, 64, 127])

    const lines = [...screen.getByTestId('midi-log').querySelectorAll('li')].map(
      (item) => item.textContent ?? '',
    )
    expect(lines[0]).toContain('sustain pedal 127')
    expect(lines[0]).toContain('b0 40 7f')
    expect(lines[1]).toContain('note on 60 velocity 90')
  })

  it('keeps the log short rather than growing all session', async () => {
    const harness = fake()
    await open(harness.input)
    for (let index = 0; index < 40; index += 1) {
      harness.send({ kind: 'on', pitch: 60, velocity: 90 }, [0x90, 60, 90])
    }
    expect(screen.getByTestId('midi-log').querySelectorAll('li')).toHaveLength(12)
  })

  it('says why there is no MIDI when there is none', async () => {
    const harness = fake({
      status: 'refused',
      devices: [],
      chosen: null,
      detail: 'the permission was refused',
    })
    await open(harness.input)
    expect(screen.getByTestId('midi-status').textContent).toBe('the permission was refused')
  })

  it('says a keyboard is wanted when none is plugged in', async () => {
    const harness = fake({ devices: [], chosen: null })
    await open(harness.input)
    expect(screen.getByTestId('midi-status').textContent).toBe('no device connected')
  })
})
