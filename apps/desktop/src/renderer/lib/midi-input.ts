import { parseMidi, type MidiEvent } from './midi'
import { appSettings } from './settings'

/**
 * The MIDI keyboards plugged into this machine, and what they are playing.
 *
 * Three things make this more than a wrapper around requestMIDIAccess.
 *
 * Hot-plug: switching a controller on after the app is running is an
 * ordinary thing to do, so a connection event reconnects rather than asking
 * for a restart. The listener is attached to whichever port matches the
 * chosen device each time the list changes, which means a device that
 * appears later is picked up without anyone doing anything.
 *
 * Memory: somebody with one controller should never have to choose it twice,
 * so the choice is kept by name as well as by id. Ids are not stable across
 * replugs on every platform; the name usually is.
 *
 * Silence on failure: the permission can be refused and the API can be
 * missing, and both are a line of text rather than an exception, because a
 * piano that plays from the screen still works without a keyboard.
 */

export type MidiDevice = {
  readonly id: string
  readonly name: string
  readonly connected: boolean
}

export type MidiState = {
  readonly status: 'starting' | 'unsupported' | 'refused' | 'ready'
  readonly devices: readonly MidiDevice[]
  /** The device being listened to, if it is there. */
  readonly chosen: string | null
  /** Why there is no MIDI, when there is none. */
  readonly detail: string
}

export type MidiInput = {
  readonly state: MidiState
  /** For useSyncExternalStore, which calls it detached. */
  readonly subscribe: (listener: () => void) => () => void
  /** Ask for access and start listening. Safe to call more than once. */
  readonly start: () => void
  readonly choose: (id: string) => void
  /** Every event from the chosen device, parsed. */
  readonly onEvent: (listener: (event: MidiEvent, raw: readonly number[]) => void) => () => void
}

/** Where the chosen keyboard is kept between sessions, by name. */
export type DeviceMemory = {
  readonly wanted: () => string | null
  readonly remember: (name: string) => void
  /** Told when what is kept changes underneath, as it does once the settings are read. */
  readonly subscribe?: (listener: () => void) => () => void
}

/** The settings, as the MIDI input remembers a keyboard in them. */
function settingsMemory(): DeviceMemory {
  const settings = appSettings()
  return {
    wanted: () => settings.state.settings.midiDevice,
    remember: (name) => {
      settings.update({ midiDevice: name })
    },
    subscribe: settings.subscribe,
  }
}

type Access = Pick<MIDIAccess, 'inputs'> & {
  onstatechange: ((event: MIDIConnectionEvent) => void) | null
}

/** The MIDI input, on a given Web MIDI implementation; the app's asks the browser. */
export function createMidiInput(
  request: (() => Promise<Access>) | undefined = navigator.requestMIDIAccess?.bind(navigator),
  memory: DeviceMemory = settingsMemory(),
): MidiInput {
  let state: MidiState = { status: 'starting', devices: [], chosen: null, detail: '' }
  let access: Access | null = null
  let started = false
  let listening: MIDIInput | null = null
  const listeners = new Set<() => void>()
  const events = new Set<(event: MidiEvent, raw: readonly number[]) => void>()
  /** The name of the device to listen to, which outlives any one port id. */
  let wanted: string | null = memory.wanted()

  const report = (next: MidiState) => {
    state = next
    for (const listener of listeners) {
      listener()
    }
  }

  const ports = (): MIDIInput[] => [...(access?.inputs.values() ?? [])]

  // The settings may be read after access was granted; the keyboard they name
  // is then listened to as soon as they say which.
  memory.subscribe?.(() => {
    const now = memory.wanted()
    if (now !== wanted) {
      wanted = now
      if (access !== null) {
        attach()
      }
    }
  })

  const onMessage = (message: MIDIMessageEvent) => {
    const data = message.data
    if (data === null) {
      return
    }
    const raw = Array.from(data)
    const event = parseMidi(raw)
    if (event === null) {
      return
    }
    for (const listener of events) {
      listener(event, raw)
    }
  }

  /**
   * Attach to the port the user wants, or to the only one there.
   *
   * Called on every state change, so a controller switched on later is
   * listened to without a restart, and one unplugged mid-session stops being
   * listened to without an error.
   */
  const attach = () => {
    const found = ports()
    const pick =
      found.find((port) => (port.name ?? port.id) === wanted) ??
      (wanted === null && found.length === 1 ? found[0] : undefined)

    if (listening !== null && listening !== pick) {
      listening.onmidimessage = null
      listening = null
    }
    if (pick !== undefined && listening !== pick) {
      pick.onmidimessage = onMessage
      listening = pick
    }

    report({
      status: 'ready',
      devices: found.map((port) => ({
        id: port.id,
        name: port.name ?? port.id,
        connected: port.state === 'connected',
      })),
      chosen: listening?.id ?? null,
      detail: found.length === 0 ? 'no MIDI device is connected' : '',
    })
  }

  return {
    get state() {
      return state
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start: () => {
      if (started) {
        return
      }
      started = true
      if (request === undefined) {
        report({
          status: 'unsupported',
          devices: [],
          chosen: null,
          detail: 'this build has no Web MIDI',
        })
        return
      }
      request()
        .then((granted) => {
          access = granted
          // Every appearance and disappearance, including the ones that
          // happen while the app is already running.
          granted.onstatechange = () => {
            attach()
          }
          attach()
        })
        .catch((cause: unknown) => {
          report({
            status: 'refused',
            devices: [],
            chosen: null,
            detail: cause instanceof Error ? cause.message : String(cause),
          })
        })
    },
    choose: (id) => {
      const port = ports().find((found) => found.id === id)
      if (port === undefined) {
        return
      }
      wanted = port.name ?? port.id
      memory.remember(wanted)
      attach()
    },
    onEvent: (listener) => {
      events.add(listener)
      return () => {
        events.delete(listener)
      }
    },
  }
}

let input: MidiInput | null = null

/** The app's one MIDI input, whatever mounts twice. */
export function appMidi(): MidiInput {
  input ??= createMidiInput()
  return input
}
