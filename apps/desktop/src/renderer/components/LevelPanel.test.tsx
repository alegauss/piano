import type { Level } from '@piano/score-format'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LEVEL_PRESETS, settingsFor, type LevelSettings } from '../lib/levels'
import { LevelPanel } from './LevelPanel'

/**
 * What a player reads before choosing: what the word means, what it will set,
 * and which of those they have since moved.
 */

async function open(
  level: Level | null,
  settings: LevelSettings = settingsFor(LEVEL_PRESETS.beginner),
) {
  const onLevel = vi.fn()
  render(<LevelPanel level={level} settings={() => settings} onLevel={onLevel} />)
  fireEvent.click(screen.getByLabelText('Level'))
  await screen.findByText('Level', { selector: 'h2' })
  return { onLevel }
}

describe('LevelPanel', () => {
  it('says the score plays as written until a level is chosen', async () => {
    await open(null)
    expect(screen.getByTestId('no-level').textContent).toContain('as written')
  })

  it('says what the level means in a sentence', async () => {
    await open('beginner')
    expect(screen.getByTestId('level-means').textContent).toBe(LEVEL_PRESETS.beginner.means)
  })

  it('names a value for every knob the level moves', async () => {
    await open('beginner')
    expect(screen.getByTestId('knob-tempo').textContent).toContain('67%')
    expect(screen.getByTestId('knob-hands-you-play').textContent).toContain('right')
    expect(screen.getByTestId('knob-waits-for-you').textContent).toContain('yes')
    expect(screen.getByTestId('knob-timing-window').textContent).toContain('250 ms')
    expect(screen.getByTestId('knob-voices-kept').textContent).toContain('1')
    expect(screen.getByTestId('knob-chords').textContent).toContain('simplified')
  })

  it('marks a knob the session has moved rather than putting it back', async () => {
    await open('beginner', {
      ...settingsFor(LEVEL_PRESETS.beginner),
      tempoScale: 1,
      waiting: false,
    })
    expect(screen.getByTestId('knob-tempo').textContent).toContain('moved')
    expect(screen.getByTestId('knob-waits-for-you').textContent).toContain('moved')
    expect(screen.getByTestId('knob-hands-you-play').textContent).not.toContain('moved')
  })

  it('offers to keep a worked-out version only when there is one to keep', async () => {
    await open('beginner')
    expect(screen.queryByText('Keep this version in the score')).toBeNull()
  })

  it('hands keeping on when a worked-out version can be kept', async () => {
    const onKeep = vi.fn()
    render(
      <LevelPanel
        level="beginner"
        settings={() => settingsFor(LEVEL_PRESETS.beginner)}
        onLevel={vi.fn()}
        source="Worked out from the rules: 2 notes fewer (chords 2)."
        onKeep={onKeep}
      />,
    )
    fireEvent.click(screen.getByLabelText('Level'))
    fireEvent.click(await screen.findByText('Keep this version in the score'))
    expect(onKeep).toHaveBeenCalledOnce()
  })

  it('offers the three levels and hands the choice on', async () => {
    const { onLevel } = await open(null)
    fireEvent.click(screen.getByText('Advanced'))
    expect(onLevel).toHaveBeenCalledWith('advanced')
    expect(screen.getByText('Beginner').getAttribute('aria-pressed')).toBe('false')
  })
})
