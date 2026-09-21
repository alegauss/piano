import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DEFAULT_SETTINGS, SETTINGS_VERSION } from '@piano/ipc'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createSettingsStore } from './settings-store'

/**
 * The settings file on a real disk. A new store over the same file is what a
 * restart is, so that is how surviving one is asserted.
 */

let directory = ''
let file = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'piano-settings-'))
  file = join(directory, 'profile', 'settings.json')
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('what the app remembers between launches', () => {
  it('starts on the defaults, and says it is the first launch', async () => {
    expect(await createSettingsStore(file).read()).toEqual({
      settings: DEFAULT_SETTINGS,
      notice: null,
      fresh: true,
    })
  })

  it('keeps the device, the calibration, the theme and the level through a restart', async () => {
    const first = createSettingsStore(file)
    await first.update({ midiDevice: 'Digital Piano', theme: 'light' })
    await first.update({ calibrations: { 'piano.latency|Digital Piano|default': 0.031 } })
    await first.update({ level: 'intermediate' })

    const restarted = await createSettingsStore(file).read()
    expect(restarted.fresh).toBe(false)
    expect(restarted.notice).toBeNull()
    expect(restarted.settings).toMatchObject({
      midiDevice: 'Digital Piano',
      theme: 'light',
      level: 'intermediate',
      calibrations: { 'piano.latency|Digital Piano|default': 0.031 },
    })
    const written = JSON.parse(await readFile(file, 'utf8')) as { version: number }
    expect(written.version).toBe(SETTINGS_VERSION)
  })

  it('falls back to the defaults for a file that is not JSON, and says so', async () => {
    await createSettingsStore(file).update({ theme: 'light' })
    await writeFile(file, '{ "theme": "li')
    const read = await createSettingsStore(file).read()
    expect(read.settings).toEqual(DEFAULT_SETTINGS)
    expect(read.notice).toContain('back at its default')
  })

  it('loses only the setting that is wrong, and names it', async () => {
    await createSettingsStore(file).update({})
    await writeFile(
      file,
      JSON.stringify({ version: 1, theme: 'light', leadSeconds: 400, strictness: 'harsh' }),
    )
    const read = await createSettingsStore(file).read()
    expect(read.settings.theme).toBe('light')
    expect(read.settings.leadSeconds).toBe(DEFAULT_SETTINGS.leadSeconds)
    expect(read.notice).toBe(
      'How far ahead the roll shows and how strictly timing is judged could not be read, so they are back at the default.',
    )
  })

  it('keeps what it understands from a newer version, and says where the file came from', async () => {
    await createSettingsStore(file).update({})
    await writeFile(file, JSON.stringify({ version: 9, theme: 'light', somethingNew: true }))
    const read = await createSettingsStore(file).read()
    expect(read.settings.theme).toBe('light')
    expect(read.notice).toContain('newer version')
  })

  it('goes back to every default on a reset, and stays there', async () => {
    const store = createSettingsStore(file)
    await store.update({ theme: 'light', effects: false })
    expect(await store.reset()).toEqual(DEFAULT_SETTINGS)
    expect((await createSettingsStore(file).read()).settings).toEqual(DEFAULT_SETTINGS)
  })

  it('writes one change after another, and leaves no half-written file behind', async () => {
    const store = createSettingsStore(file)
    await Promise.all([
      store.update({ theme: 'light' }),
      store.update({ effects: false }),
      store.update({ leadSeconds: 5 }),
    ])
    expect((await createSettingsStore(file).read()).settings).toMatchObject({
      theme: 'light',
      effects: false,
      leadSeconds: 5,
    })
    expect(await readdir(join(directory, 'profile'))).toEqual(['settings.json'])
  })
})
