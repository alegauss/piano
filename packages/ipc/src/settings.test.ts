import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SETTINGS,
  readSettings,
  SETTINGS_VERSION,
  settingsPatchSchema,
  storedSettings,
} from './settings'

/**
 * Reading settings from whatever the file held. One bad value costs that
 * setting and nothing else, and nothing that is not a setting gets in.
 */

describe('reading the settings file', () => {
  it('keeps what is valid and names what is not', () => {
    const read = readSettings({ version: 1, theme: 'light', leadSeconds: -4, level: 'expert' })
    expect(read.settings).toEqual({ ...DEFAULT_SETTINGS, theme: 'light' })
    expect(read.invalid).toEqual(['level', 'leadSeconds'])
  })

  it('treats a file that is not an object as nothing but defaults', () => {
    for (const raw of [null, [], 'settings', 7]) {
      expect(readSettings(raw).settings).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('drops keys that are not settings, such as a token somebody pasted in', () => {
    const read = readSettings({ token: 'secret', theme: 'dark' })
    expect(read.settings).not.toHaveProperty('token')
    expect(read.invalid).toEqual([])
  })

  it('reads back exactly what it writes, with the version beside it', () => {
    const settings = { ...DEFAULT_SETTINGS, midiDevice: 'Digital Piano', calibrations: { k: 0.02 } }
    const written = storedSettings(settings)
    expect(written['version']).toBe(SETTINGS_VERSION)
    expect(readSettings(JSON.parse(JSON.stringify(written))).settings).toEqual(settings)
  })

  it('refuses a change to something that is not a setting', () => {
    expect(settingsPatchSchema.safeParse({ theme: 'light' }).success).toBe(true)
    expect(settingsPatchSchema.safeParse({ token: 'x' }).success).toBe(false)
    expect(settingsPatchSchema.safeParse({ leadSeconds: 100 }).success).toBe(false)
  })
})
