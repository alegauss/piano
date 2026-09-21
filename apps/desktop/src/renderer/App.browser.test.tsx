import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from './App'

/**
 * The whole app, in a browser, because this is where the pieces meet: one
 * transport, the roll reading it, the bar driving it, and a mode that takes
 * everything else away. It needs a real AudioContext and a real layout, so
 * jsdom cannot answer it.
 */

function parts() {
  return {
    roll: screen.queryByLabelText('Falling notes'),
    keyboard: screen.queryByLabelText('Piano keyboard, 88 keys'),
    bar: screen.queryByLabelText('Transport'),
    heading: screen.queryByRole('heading', { name: 'Piano' }),
    gallery: screen.queryByRole('button', { name: 'Play' }),
  }
}

describe('the app', () => {
  it('opens with the roll, the keyboard and the bar that drives them', () => {
    render(<App />)
    const { roll, keyboard, bar } = parts()
    expect(roll).not.toBeNull()
    expect(keyboard).not.toBeNull()
    expect(bar).not.toBeNull()
  })

  it('leaves only the roll and the keyboard in full screen, and comes back on escape', async () => {
    render(<App />)
    expect(parts().heading).not.toBeNull()

    screen.getByLabelText('Full screen').click()
    await new Promise((resolve) => requestAnimationFrame(resolve))

    const full = parts()
    expect(full.roll).not.toBeNull()
    expect(full.keyboard).not.toBeNull()
    // The bar stays: it is how someone playing gets back out.
    expect(full.bar).not.toBeNull()
    expect(full.heading).toBeNull()
    expect(full.gallery).toBeNull()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(parts().heading).not.toBeNull()
  })
})
