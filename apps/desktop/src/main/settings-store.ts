import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import {
  DEFAULT_SETTINGS,
  readSettings,
  SETTINGS_VERSION,
  storedSettings,
  type Settings,
  type SettingsPatch,
} from '@piano/ipc'

import { replace } from './replace'

/**
 * The settings file, which main owns.
 *
 * Read once and held; every change is merged into what is held and written
 * whole, one write after another, into a file beside the real one and then
 * moved over it, so a crash mid-write leaves the last good settings rather
 * than half of them. What cannot be read is never a reason to fail: the app
 * starts on defaults and the window is told what was lost and why.
 */

export type SettingsLoaded = {
  readonly settings: Settings
  /** What had to go back to its default, said for a person; null when nothing did. */
  readonly notice: string | null
  /** No file was there: a first launch, or one after the settings were deleted. */
  readonly fresh: boolean
}

export type SettingsStore = {
  readonly read: () => Promise<SettingsLoaded>
  readonly update: (patch: SettingsPatch) => Promise<Settings>
  readonly reset: () => Promise<Settings>
}

/** The names a person would recognise, for a notice about which settings were reset. */
const NAMES: Readonly<Record<keyof Settings, string>> = {
  theme: 'the theme',
  level: 'the level',
  midiDevice: 'the MIDI keyboard',
  calibrations: 'the latency calibration',
  effects: 'the roll’s effects',
  leadSeconds: 'how far ahead the roll shows',
  strictness: 'how strictly timing is judged',
  view: 'whether the piece opens on the roll or the stave',
}

function listed(names: readonly string[]): string {
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`
}

async function load(file: string): Promise<SettingsLoaded> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return { settings: DEFAULT_SETTINGS, notice: null, fresh: true }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return {
      settings: DEFAULT_SETTINGS,
      notice: 'The settings file could not be read, so every setting is back at its default.',
      fresh: false,
    }
  }
  const { settings, invalid } = readSettings(raw)
  const version = (raw as { version?: unknown } | null)?.version
  const newer = typeof version === 'number' && version > SETTINGS_VERSION
  const reset =
    invalid.length === 0
      ? null
      : `${listed(invalid.map((key) => NAMES[key as keyof Settings]))} could not be read, so ${
          invalid.length === 1 ? 'it is' : 'they are'
        } back at the default.`
  const notice = [
    newer ? 'These settings were written by a newer version of the app.' : null,
    reset === null ? null : `${reset.charAt(0).toUpperCase()}${reset.slice(1)}`,
  ]
    .filter((line) => line !== null)
    .join(' ')
  return { settings, notice: notice === '' ? null : notice, fresh: false }
}

export function createSettingsStore(file: string): SettingsStore {
  let loaded: Promise<SettingsLoaded> | null = null
  let held: Settings | null = null
  let writing: Promise<unknown> = Promise.resolve()

  const current = async (): Promise<Settings> => {
    loaded ??= load(file)
    held ??= (await loaded).settings
    return held
  }

  /**
   * One change: read what is held, change it, write it. Changes wait for the
   * one before them, merge included, so two arriving together both land
   * rather than the second being made from what the first had not yet saved.
   */
  const change = (next: (settings: Settings) => Settings): Promise<Settings> => {
    const run = writing.then(async () => {
      const settings = next(await current())
      held = settings
      await mkdir(dirname(file), { recursive: true })
      const partial = `${file}.partial`
      await writeFile(partial, `${JSON.stringify(storedSettings(settings), null, 2)}\n`, 'utf8')
      await replace(partial, file)
      return settings
    })
    // One failed write must not stop every later one from being tried.
    writing = run.catch(() => {})
    return run
  }

  return {
    // What was found at launch, with every change since: a window that
    // reloads is told the settings as they are, not as they were.
    read: async () => {
      const first = await (loaded ??= load(file))
      return { ...first, settings: held ?? first.settings }
    },
    update: (patch) => change((settings) => ({ ...settings, ...patch })),
    reset: () => change(() => DEFAULT_SETTINGS),
  }
}
