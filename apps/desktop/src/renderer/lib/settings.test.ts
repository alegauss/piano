import { DEFAULT_SETTINGS, type PianoBridge, type Settings, type SettingsPatch } from '@piano/ipc'
import { describe, expect, it } from 'vitest'

import { createSettings, legacySettings, type Legacy } from './settings'

/**
 * The window's copy of the settings, against a main that keeps them in a
 * variable. The claims: a change shows at once and reaches main, what the
 * file said arrives without undoing a change made before it, and what an
 * older version kept in the browser is moved over exactly once.
 */

function fakeMain(held: Settings = DEFAULT_SETTINGS, fresh = false, notice: string | null = null) {
  let kept = held
  const written: SettingsPatch[] = []
  let answer: () => void = () => {}
  const reading = new Promise<void>((resolve) => {
    answer = resolve
  })
  const bridge: Pick<PianoBridge, 'readSettings' | 'writeSettings' | 'resetSettings'> = {
    readSettings: async () => {
      await reading
      return { settings: kept, notice, fresh }
    },
    writeSettings: (patch) => {
      written.push(patch)
      kept = { ...kept, ...patch }
      return Promise.resolve(kept)
    },
    resetSettings: () => {
      kept = DEFAULT_SETTINGS
      return Promise.resolve(kept)
    },
  }
  return { bridge, written, answer: () => answer(), kept: () => kept }
}

function legacy(seed: Record<string, string>): Legacy & { readonly held: Map<string, string> } {
  const held = new Map(Object.entries(seed))
  return {
    held,
    keys: () => [...held.keys()],
    get: (key) => held.get(key) ?? null,
    remove: (key) => {
      held.delete(key)
    },
  }
}

describe('the settings in the window', () => {
  it('arrives from main, with anything that had to go back to its default said', async () => {
    const main = fakeMain({ ...DEFAULT_SETTINGS, theme: 'light' }, false, 'The theme was reset.')
    const settings = createSettings(main.bridge, legacy({}))
    expect(settings.state.loaded).toBe(false)
    const loading = settings.load()
    main.answer()
    await loading
    expect(settings.state).toMatchObject({
      loaded: true,
      notice: 'The theme was reset.',
      settings: { theme: 'light' },
    })
  })

  it('changes at once and tells main, which is what keeps it through a restart', () => {
    const main = fakeMain()
    const settings = createSettings(main.bridge, legacy({}))
    settings.update({ effects: false })
    expect(settings.state.settings.effects).toBe(false)
    expect(main.written).toEqual([{ effects: false }])
  })

  it('keeps a change made before the file was read, rather than being undone by the read', async () => {
    const main = fakeMain({ ...DEFAULT_SETTINGS, leadSeconds: 6 })
    const settings = createSettings(main.bridge, legacy({}))
    const loading = settings.load()
    settings.update({ theme: 'light' })
    main.answer()
    await loading
    expect(settings.state.settings).toMatchObject({ theme: 'light', leadSeconds: 6 })
  })

  it('moves what an older version kept in the browser into a first settings file, once', async () => {
    const old = legacy({
      'piano.theme': 'light',
      'piano.midi.device': 'Digital Piano',
      'piano.latency|Digital Piano|default': '0.031',
      'piano.latency|keys|default': 'not a number',
      'piano.progress': '{}',
    })
    const main = fakeMain(DEFAULT_SETTINGS, true)
    const settings = createSettings(main.bridge, old)
    main.answer()
    await settings.load()

    expect(main.kept()).toMatchObject({
      theme: 'light',
      midiDevice: 'Digital Piano',
      calibrations: { 'piano.latency|Digital Piano|default': 0.031 },
    })
    // What was moved is gone from the browser; what was not a setting stays.
    expect([...old.held.keys()].sort()).toEqual(['piano.latency|keys|default', 'piano.progress'])
  })

  it('leaves the browser alone when a settings file was already there', async () => {
    const old = legacy({ 'piano.theme': 'light' })
    const main = fakeMain(DEFAULT_SETTINGS, false)
    const settings = createSettings(main.bridge, old)
    main.answer()
    await settings.load()
    expect(main.written).toEqual([])
    expect(old.held.has('piano.theme')).toBe(true)
  })

  it('goes back to every default on a reset', async () => {
    const main = fakeMain({ ...DEFAULT_SETTINGS, effects: false, level: 'advanced' })
    const settings = createSettings(main.bridge, legacy({}))
    main.answer()
    await settings.load()
    await settings.reset()
    expect(settings.state.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('says so when a change could not be saved', async () => {
    const main = fakeMain()
    const settings = createSettings(
      { ...main.bridge, writeSettings: () => Promise.reject(new Error('disk full')) },
      legacy({}),
    )
    settings.update({ effects: false })
    await Promise.resolve()
    await Promise.resolve()
    expect(settings.state.notice).toContain('disk full')
  })

  it('works without main at all, as in a plain browser tab', () => {
    const settings = createSettings(null, legacy({}), { theme: 'light' })
    expect(settings.state).toMatchObject({ loaded: true, settings: { theme: 'light' } })
  })

  it('carries over only what fits a setting', () => {
    const moved = legacySettings(legacy({ 'piano.theme': 'neon', 'piano.midi.device': '' }))
    expect(moved).toEqual({ patch: {}, keys: [] })
  })
})
