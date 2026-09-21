import { beforeEach, describe, expect, it } from 'vitest'

import type { MidiEvent } from './midi'
import { createMidiInput } from './midi-input'

/**
 * A Web MIDI implementation the test drives by hand: ports appear, disappear
 * and send messages when it says so. There is no other way to test hot-plug,
 * which is the behaviour that matters most here and the one nobody can
 * reproduce without unplugging something.
 */

class FakePort {
  onmidimessage: ((event: MIDIMessageEvent) => void) | null = null
  state = 'connected'

  constructor(
    readonly id: string,
    readonly name: string,
  ) {}

  send(bytes: number[]): void {
    this.onmidimessage?.({ data: new Uint8Array(bytes) } as MIDIMessageEvent)
  }
}

class FakeAccess {
  readonly inputs = new Map<string, FakePort>()
  onstatechange: ((event: MIDIConnectionEvent) => void) | null = null

  plug(port: FakePort): void {
    this.inputs.set(port.id, port)
    this.onstatechange?.({} as MIDIConnectionEvent)
  }

  unplug(id: string): void {
    this.inputs.delete(id)
    this.onstatechange?.({} as MIDIConnectionEvent)
  }
}

function setup(access = new FakeAccess()) {
  const input = createMidiInput(() => Promise.resolve(access as never))
  const heard: MidiEvent[] = []
  input.onEvent((event) => heard.push(event))
  return { access, input, heard }
}

describe('finding a controller', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('lists what is plugged in, by name', async () => {
    const { access, input } = setup()
    access.inputs.set('a', new FakePort('a', 'Digital Piano'))
    input.start()
    await Promise.resolve()

    expect(input.state.status).toBe('ready')
    expect(input.state.devices).toEqual([{ id: 'a', name: 'Digital Piano', connected: true }])
  })

  it('listens to the only device there without being asked', async () => {
    const { access, input, heard } = setup()
    const port = new FakePort('a', 'Digital Piano')
    access.inputs.set('a', port)
    input.start()
    await Promise.resolve()

    port.send([0x90, 60, 90])
    expect(heard).toEqual([{ kind: 'on', pitch: 60, velocity: 90 }])
  })

  it('says so when there is no Web MIDI at all, rather than throwing', () => {
    const input = createMidiInput(undefined)
    input.start()
    expect(input.state.status).toBe('unsupported')
    expect(input.state.detail).not.toBe('')
  })

  it('says so when the permission is refused', async () => {
    const input = createMidiInput(() => Promise.reject(new Error('no')))
    input.start()
    await Promise.resolve()
    await Promise.resolve()
    expect(input.state.status).toBe('refused')
    expect(input.state.detail).toBe('no')
  })

  it('asks once, however many times it is started', async () => {
    let asked = 0
    const access = new FakeAccess()
    const input = createMidiInput(() => {
      asked += 1
      return Promise.resolve(access as never)
    })
    input.start()
    input.start()
    await Promise.resolve()
    expect(asked).toBe(1)
  })
})

describe('a controller switched on later', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('connects without a restart', async () => {
    const { access, input, heard } = setup()
    input.start()
    await Promise.resolve()
    expect(input.state.devices).toEqual([])

    const port = new FakePort('a', 'Digital Piano')
    access.plug(port)

    expect(input.state.devices).toHaveLength(1)
    port.send([0x90, 64, 80])
    expect(heard).toEqual([{ kind: 'on', pitch: 64, velocity: 80 }])
  })

  it('stops being listened to when it is unplugged, without an error', async () => {
    const { access, input } = setup()
    const port = new FakePort('a', 'Digital Piano')
    access.inputs.set('a', port)
    input.start()
    await Promise.resolve()
    expect(input.state.chosen).toBe('a')

    access.unplug('a')
    expect(input.state.chosen).toBeNull()
    expect(input.state.devices).toEqual([])
  })

  it('is picked up again by name, even under a new id', async () => {
    const { access, input, heard } = setup()
    access.inputs.set('a', new FakePort('a', 'Digital Piano'))
    access.inputs.set('b', new FakePort('b', 'Drum Pad'))
    input.start()
    await Promise.resolve()

    // Two devices, so nothing is chosen until somebody chooses.
    expect(input.state.chosen).toBeNull()
    input.choose('a')
    expect(input.state.chosen).toBe('a')

    // Replugged: same keyboard, new port id.
    access.unplug('a')
    const again = new FakePort('a-2', 'Digital Piano')
    access.plug(again)
    expect(input.state.chosen).toBe('a-2')
    again.send([0x90, 67, 70])
    expect(heard).toEqual([{ kind: 'on', pitch: 67, velocity: 70 }])
  })
})

describe('remembering the choice', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('does not ask twice in two sessions', async () => {
    const first = setup()
    first.access.inputs.set('a', new FakePort('a', 'Digital Piano'))
    first.access.inputs.set('b', new FakePort('b', 'Drum Pad'))
    first.input.start()
    await Promise.resolve()
    first.input.choose('b')
    expect(first.input.state.chosen).toBe('b')

    // A second session, with the same two devices in the other order.
    const next = setup()
    next.access.inputs.set('x', new FakePort('x', 'Digital Piano'))
    next.access.inputs.set('y', new FakePort('y', 'Drum Pad'))
    next.input.start()
    await Promise.resolve()
    expect(next.input.state.chosen).toBe('y')
  })
})
