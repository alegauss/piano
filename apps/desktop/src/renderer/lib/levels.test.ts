import { LEVELS, type Reduced, type Rule } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { WINDOWS } from './grading'
import {
  describeAuthored,
  describeKept,
  describeHands,
  describeReduction,
  handsPlayed,
  LEVEL_PRESETS,
  moved,
  settingsFor,
  viewFor,
  type LevelSettings,
} from './levels'
import { NOTHING_TOUCHED } from './parts'

/**
 * The claim under test is the one the line makes: that the three words name
 * something specific, and that naming it does not nail anything down.
 */

describe('the three levels', () => {
  it.each(LEVELS)('gives %s a value for every knob', (level) => {
    const preset = LEVEL_PRESETS[level]
    expect(preset.level).toBe(level)
    expect(preset.means.length).toBeGreaterThan(0)
    expect(preset.tempoScale).toBeGreaterThan(0)
    expect(preset.plays.length).toBeGreaterThan(0)
    expect(typeof preset.waiting).toBe('boolean')
    expect(WINDOWS[preset.strictness]).toBeGreaterThan(0)
    expect(preset.reduction.voices === null || preset.reduction.voices > 0).toBe(true)
    expect(typeof preset.reduction.ornaments).toBe('boolean')
    expect(['as written', 'simplified']).toContain(preset.reduction.chords)
  })

  it('means at beginner what the level promises: one hand, slower, and waited for', () => {
    const preset = LEVEL_PRESETS.beginner
    expect(preset.plays).toEqual(['right'])
    expect(preset.tempoScale).toBeCloseTo(2 / 3, 2)
    expect(preset.waiting).toBe(true)
    expect(preset.reduction.chords).toBe('simplified')
  })

  it('means at advanced the score as written, both hands, nothing waiting', () => {
    const preset = LEVEL_PRESETS.advanced
    expect(preset.tempoScale).toBe(1)
    expect(preset.plays).toHaveLength(2)
    expect(preset.waiting).toBe(false)
    expect(preset.reduction).toEqual({ voices: null, ornaments: true, chords: 'as written' })
  })

  it('gets harder in one direction: faster, tighter, and less taken away', () => {
    const [beginner, intermediate, advanced] = LEVELS.map((level) => LEVEL_PRESETS[level])
    const tempos = [beginner, intermediate, advanced].map((preset) => preset?.tempoScale ?? 0)
    const windows = [beginner, intermediate, advanced].map((preset) =>
      preset === undefined ? 0 : WINDOWS[preset.strictness],
    )
    expect(tempos).toEqual([...tempos].sort((one, other) => one - other))
    expect(windows).toEqual([...windows].sort((one, other) => other - one))
  })
})

describe('what a level does to the session', () => {
  it('has the app accompany the hand the player is not taking', () => {
    const view = viewFor(LEVEL_PRESETS.beginner, NOTHING_TOUCHED)
    expect(view.mutedHands).toEqual(['right'])
    expect(handsPlayed(view)).toEqual(['right'])
  })

  it('accompanies nothing where the player takes both, rather than silencing the piece', () => {
    const view = viewFor(LEVEL_PRESETS.advanced, NOTHING_TOUCHED)
    expect(view.mutedHands).toEqual([])
    expect(handsPlayed(view)).toEqual(['left', 'right'])
  })

  it('leaves everything else in the view alone', () => {
    const held = { ...NOTHING_TOUCHED, muted: ['left'], hiddenHands: ['left' as const] }
    expect(viewFor(LEVEL_PRESETS.beginner, held)).toMatchObject({
      muted: ['left'],
      hiddenHands: ['left'],
    })
  })

  it('takes the tempo from the score where the score has an opinion', () => {
    expect(settingsFor(LEVEL_PRESETS.beginner).tempoScale).toBeCloseTo(2 / 3, 6)
    expect(settingsFor(LEVEL_PRESETS.beginner, { tempoScale: 0.4 }).tempoScale).toBe(0.4)
  })
})

describe('a level being a starting point rather than a cage', () => {
  const under = settingsFor(LEVEL_PRESETS.beginner)
  const same = (over: Partial<LevelSettings> = {}): LevelSettings => ({ ...under, ...over })

  it('says nothing has moved while nothing has', () => {
    expect(moved(under, same())).toEqual([])
  })

  it('names the knob that moved, and only that one', () => {
    expect(moved(under, same({ tempoScale: 0.9 }))).toEqual(['tempoScale'])
    expect(moved(under, same({ waiting: false }))).toEqual(['waiting'])
    expect(moved(under, same({ strictness: 'strict' }))).toEqual(['strictness'])
    expect(moved(under, same({ plays: ['left'] }))).toEqual(['plays'])
  })

  it('does not call a rounding difference a change of tempo', () => {
    expect(moved(under, same({ tempoScale: under.tempoScale + 0.0001 }))).toEqual([])
  })
})

describe('saying where the piece came from', () => {
  const reduced = (cuts: { rule: Rule; dropped: number }[]): Reduced => ({
    notes: [],
    arrangement: null,
    cuts,
    anonymous: 0,
  })

  it('offers a worked-out version as a proposal, naming what each rule took', () => {
    const said = describeReduction(
      reduced([
        { rule: 'chords', dropped: 2 },
        { rule: 'ornaments', dropped: 1 },
      ]),
    )
    expect(said).toContain('3 notes fewer')
    expect(said).toContain('chords 2')
    expect(said).toContain('ornaments 1')
  })

  it('says so when there was nothing to simplify', () => {
    expect(describeReduction(reduced([]))).toContain('nothing here needed simplifying')
  })

  it('names the score’s own version, which wins over a worked-out one', () => {
    expect(describeAuthored('Melody only')).toContain('Melody only')
  })

  it('says a kept version is still the rules’ work, and where to change it', () => {
    expect(describeKept()).toContain('as the rules worked it out')
    expect(describeKept()).not.toBe(describeAuthored('Generated'))
  })
})

describe('saying the hands out loud', () => {
  it('says both rather than listing them', () => {
    expect(describeHands(['left', 'right'])).toBe('both')
    expect(describeHands(['right'])).toBe('right')
    expect(describeHands([])).toBe('none')
  })
})
