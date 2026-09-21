import { DEFAULT_SETTINGS, type PianoBridge, type Settings, type SettingsPatch } from '@piano/ipc'

import { readBridge } from '../bridge'
import { getTheme } from './theme'

/**
 * What the window remembers between launches, as the window sees it.
 *
 * Main owns the file; this holds a copy and changes it at once, so a switch
 * flips when it is pressed rather than after a round trip, and sends each
 * change on to main. Anything changed before the file has been read is laid
 * over what the file says, so an early choice is not undone by the read.
 *
 * Earlier versions kept the theme, the keyboard and the calibrations in the
 * browser's own storage. The first time the app runs with a settings file
 * that does not exist yet, those are carried into it and removed, so nobody
 * calibrates twice because the place they were kept moved.
 */

export type SettingsState = {
  readonly settings: Settings
  /** Whether the file has been read; until then the defaults stand in. */
  readonly loaded: boolean
  /** What had to go back to its default, or could not be saved, said for a person. */
  readonly notice: string | null
}

export type SettingsStore = {
  readonly state: SettingsState
  readonly subscribe: (listener: () => void) => () => void
  /** Read the file, once however often it is asked. */
  readonly load: () => Promise<void>
  readonly update: (patch: SettingsPatch) => void
  /** Every setting back to its default. */
  readonly reset: () => Promise<void>
  /** The notice has been read. */
  readonly dismiss: () => void
}

type SettingsBridge = Pick<PianoBridge, 'readSettings' | 'writeSettings' | 'resetSettings'>

/** The browser storage an older version wrote to, as far as moving out of it needs. */
export type Legacy = {
  readonly keys: () => readonly string[]
  readonly get: (key: string) => string | null
  readonly remove: (key: string) => void
}

const LEGACY_THEME = 'piano.theme'
const LEGACY_DEVICE = 'piano.midi.device'
const LEGACY_CALIBRATION = 'piano.latency|'

/** What an older version remembered, as settings; anything that does not fit is left behind. */
export function legacySettings(legacy: Legacy): { patch: SettingsPatch; keys: string[] } {
  const patch: { -readonly [K in keyof SettingsPatch]: SettingsPatch[K] } = {}
  const keys: string[] = []
  const theme = legacy.get(LEGACY_THEME)
  if (theme === 'light' || theme === 'dark') {
    patch.theme = theme
    keys.push(LEGACY_THEME)
  }
  const device = legacy.get(LEGACY_DEVICE)
  if (device !== null && device !== '' && device.length <= 200) {
    patch.midiDevice = device
    keys.push(LEGACY_DEVICE)
  }
  const calibrations: Record<string, number> = {}
  for (const key of legacy.keys().filter((one) => one.startsWith(LEGACY_CALIBRATION))) {
    const seconds = Number(legacy.get(key))
    if (Number.isFinite(seconds) && Math.abs(seconds) <= 1 && key.length <= 300) {
      calibrations[key] = seconds
      keys.push(key)
    }
  }
  if (Object.keys(calibrations).length > 0) {
    patch.calibrations = calibrations
  }
  return { patch, keys }
}

const browserLegacy: Legacy = {
  keys: () => {
    try {
      return Array.from(
        { length: localStorage.length },
        (_, index) => localStorage.key(index) ?? '',
      )
    } catch {
      return []
    }
  },
  get: (key) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key)
    } catch {
      // Left behind, it is read by nothing.
    }
  },
}

const because = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))

export function createSettings(
  bridge: SettingsBridge | null,
  legacy: Legacy = browserLegacy,
  /** What is already known before the file is read, such as the theme the page opened in. */
  known: SettingsPatch = {},
): SettingsStore {
  let state: SettingsState = {
    settings: { ...DEFAULT_SETTINGS, ...known },
    loaded: bridge === null,
    notice: null,
  }
  let pending: SettingsPatch = {}
  let loading: Promise<void> | null = null
  const listeners = new Set<() => void>()

  const set = (next: SettingsState) => {
    state = next
    for (const listener of listeners) {
      listener()
    }
  }

  const update = (patch: SettingsPatch) => {
    if (!state.loaded) {
      pending = { ...pending, ...patch }
    }
    set({ ...state, settings: { ...state.settings, ...patch } })
    bridge?.writeSettings(patch).catch((cause: unknown) => {
      set({ ...state, notice: `A setting could not be saved: ${because(cause)}` })
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
    load: () =>
      (loading ??= (async () => {
        if (bridge === null) {
          return
        }
        try {
          const read = await bridge.readSettings()
          set({
            settings: { ...read.settings, ...pending },
            loaded: true,
            notice: read.notice,
          })
          pending = {}
          if (read.fresh) {
            const moved = legacySettings(legacy)
            if (moved.keys.length > 0) {
              update(moved.patch)
              for (const key of moved.keys) {
                legacy.remove(key)
              }
            }
          }
        } catch (cause: unknown) {
          set({
            ...state,
            loaded: true,
            notice: `The settings could not be read, so the defaults are in use: ${because(cause)}`,
          })
        }
      })()),
    update,
    reset: async () => {
      if (bridge === null) {
        set({ ...state, settings: DEFAULT_SETTINGS, notice: null })
        return
      }
      const settings = await bridge.resetSettings()
      set({ settings, loaded: true, notice: null })
    },
    dismiss: () => {
      set({ ...state, notice: null })
    },
  }
}

let store: SettingsStore | null = null

/** The app's one settings store, whatever mounts twice. */
export function appSettings(): SettingsStore {
  store ??= createSettings(readBridge(), browserLegacy, { theme: getTheme() })
  return store
}
