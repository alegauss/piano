import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { contrastOf, OBJECT_CONTRAST, TEXT_CONTRAST } from '../../lib/contrast'
import { Button } from './button'

/**
 * Whether a chosen option looks chosen, measured rather than admired.
 *
 * This is the defect the variant exists for: the chosen one used to carry
 * `surface-overlay`, which in the light theme is white on a near-white panel,
 * so the only difference between the option somebody had picked and the three
 * they had not was the weight of its text. "Looks bolder" is not a thing
 * anybody reads as "this is the one", and it is not a difference at all on a
 * dim screen or for somebody who is not looking for it.
 *
 * So the question is asked of the browser, in both themes, as the palette's
 * own claims are: what the pixels actually come out as.
 */

const THEMES = ['dark', 'light'] as const

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

function paint(theme: (typeof THEMES)[number]) {
  document.documentElement.dataset['theme'] = theme
  render(
    <div className="bg-surface-base p-4" data-testid="panel">
      <Button variant="selected">Chosen</Button>
      <Button variant="ghost">Not chosen</Button>
    </div>,
  )
  const seen = (element: Element) => getComputedStyle(element)
  return {
    panel: seen(screen.getByTestId('panel')),
    chosen: seen(screen.getByRole('button', { name: 'Chosen' })),
    other: seen(screen.getByRole('button', { name: 'Not chosen' })),
  }
}

describe.each(THEMES)('a chosen option in the %s theme', (theme) => {
  it('is a shape on the panel rather than a word on it', () => {
    const { panel, chosen } = paint(theme)
    expect(contrastOf(chosen.backgroundColor, panel.backgroundColor)).toBeGreaterThanOrEqual(
      OBJECT_CONTRAST,
    )
  })

  it('is told from the ones beside it by more than the weight of its text', () => {
    const { chosen, other } = paint(theme)
    // The unchosen one is transparent over the panel, so the panel is what it
    // reads as: what has to differ is the chosen one against that.
    expect(chosen.fontWeight).toBe(other.fontWeight)
    expect(contrastOf(chosen.backgroundColor, other.backgroundColor)).toBeGreaterThanOrEqual(
      OBJECT_CONTRAST,
    )
  })

  it('keeps its own label readable on the colour it took', () => {
    const { chosen } = paint(theme)
    expect(contrastOf(chosen.color, chosen.backgroundColor)).toBeGreaterThanOrEqual(TEXT_CONTRAST)
  })
})
