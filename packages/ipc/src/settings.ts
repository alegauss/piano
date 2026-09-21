import { z } from 'zod'

/**
 * What the app remembers between launches, declared once.
 *
 * The chosen keyboard, the calibration measured with it, the theme, the level,
 * whether the roll's effects are on, how far ahead it shows, and how strictly
 * timing is judged: a person sets each of these once, and an app that asks
 * again at every launch feels as though it forgot them. Main keeps them in one
 * file in the app's profile and the renderer reads and writes them through
 * three channels, validated at both ends by the schema below.
 *
 * A file somebody edited by hand, or one a crash cut short, never stops the
 * app starting: each setting is read on its own, one that is not valid goes
 * back to its default, and the window is told which, rather than the whole
 * file being thrown away over one bad value or the app refusing to open.
 *
 * Nothing secret belongs here. The token the MCP server presents is made new
 * for every run and never written to this file.
 *
 * Nor does the library's location, though it is chosen once too: the MCP
 * server reads the same folder and cannot see this file, so a location set
 * here would split the app and Claude Code between two libraries. PIANO_LIBRARY
 * sets it for both.
 */

/** Which shape of the file this is; a new shape comes with a migration from the old. */
export const SETTINGS_VERSION = 1

export const settingsSchema = z.object({
  theme: z.enum(['dark', 'light']),
  /** The level last chosen, or null for the piece as written. */
  level: z.enum(['beginner', 'intermediate', 'advanced']).nullable(),
  /** The keyboard to listen to, by name, which outlives a port id across replugs. */
  midiDevice: z.string().min(1).max(200).nullable(),
  /** Input lag in seconds, per device and output, as calibrationKey names them. */
  calibrations: z.record(z.string().min(1).max(300), z.number().min(-1).max(1)),
  effects: z.boolean(),
  /** Seconds of music the roll shows ahead of the keyboard. */
  leadSeconds: z.number().min(0.5).max(12),
  /** How strictly an attempt's timing is judged. */
  strictness: z.enum(['gentle', 'steady', 'strict']),
  /**
   * Which reading of the piece the window opens on: the falling roll, or the
   * stave. Remembered because somebody who reads music reads every piece that
   * way, and being handed the roll at each launch is being asked again.
   */
  view: z.enum(['roll', 'sheet']),
})

export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  level: null,
  midiDevice: null,
  calibrations: {},
  effects: true,
  leadSeconds: 3,
  strictness: 'steady',
  view: 'roll',
}

/** Some settings changed at once; the rest stay as they are. Anything not a setting is refused. */
export const settingsPatchSchema = settingsSchema.partial().strict()

export type SettingsPatch = z.infer<typeof settingsPatchSchema>

/** What reading the file came to: the settings, and which ones had to go back to their default. */
export type SettingsRead = {
  readonly settings: Settings
  /** The names of the settings that were not valid and are at their default now. */
  readonly invalid: readonly string[]
}

type Key = keyof Settings

const KEYS = Object.keys(settingsSchema.shape) as Key[]

/**
 * Settings from whatever was in the file, one at a time.
 *
 * A value that validates is kept and one that does not is replaced by its
 * default and named, so a single bad field costs that field and nothing else.
 * Keys that are not settings are dropped. A file from a newer version keeps
 * every setting this version still understands.
 */
export function readSettings(raw: unknown): SettingsRead {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { settings: DEFAULT_SETTINGS, invalid: KEYS }
  }
  const record = raw as Record<string, unknown>
  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  const invalid: Key[] = []
  for (const key of KEYS) {
    if (!(key in record)) {
      continue
    }
    const parsed = settingsSchema.shape[key].safeParse(record[key])
    if (parsed.success) {
      settings[key] = parsed.data
    } else {
      invalid.push(key)
    }
  }
  return { settings: settings as Settings, invalid }
}

/** What goes in the file: the settings, and the version of the shape they are in. */
export function storedSettings(settings: Settings): Record<string, unknown> {
  return { version: SETTINGS_VERSION, ...settings }
}
