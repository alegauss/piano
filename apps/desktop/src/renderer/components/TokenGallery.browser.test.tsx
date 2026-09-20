import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { CANVAS_TOKENS, readCanvasPalette } from '../lib/theme'
import { TokenGallery } from './TokenGallery'

/**
 * These run in a real browser because every claim below is about a value the
 * browser computes. jsdom resolves no custom property and lays nothing out, so
 * it would answer these questions with whatever the test asserted.
 */

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

function setTheme(theme: 'dark' | 'light'): void {
  document.documentElement.dataset['theme'] = theme
}

describe('the token palette, resolved by a real browser', () => {
  it('gives every canvas token a value in the dark theme', () => {
    setTheme('dark')
    const palette = readCanvasPalette()
    for (const token of CANVAS_TOKENS) {
      expect(palette[token], `${token} resolved to nothing`).not.toBe('')
    }
  })

  it('gives every canvas token a different value in the light theme', () => {
    setTheme('dark')
    const dark = readCanvasPalette()
    setTheme('light')
    const light = readCanvasPalette()

    const unchanged = CANVAS_TOKENS.filter((token) => dark[token] === light[token])
    expect(unchanged, 'these tokens are the same in both themes').toEqual([])
  })

  it('resolves the chrome and the canvas from the same switch', () => {
    setTheme('dark')
    const darkBody = getComputedStyle(document.body).backgroundColor
    const darkRoll = readCanvasPalette()['--roll-background']

    setTheme('light')
    const lightBody = getComputedStyle(document.body).backgroundColor
    const lightRoll = readCanvasPalette()['--roll-background']

    expect(lightBody).not.toBe(darkBody)
    expect(lightRoll).not.toBe(darkRoll)
  })
})

describe('the gallery, laid out', () => {
  it('renders every component the design system claims to ship', () => {
    render(<TokenGallery />)
    for (const label of ['Button', 'Switch', 'Slider', 'Select', 'Popover', 'Dialog', 'Canvas']) {
      expect(screen.getByText(label)).toBeVisible()
    }
  })

  it('gives the buttons a real size, which is what jsdom cannot answer', () => {
    render(<TokenGallery />)
    const play = screen.getByRole('button', { name: 'Play' })
    const box = play.getBoundingClientRect()
    expect(box.height).toBeGreaterThan(24)
    expect(box.width).toBeGreaterThan(40)
  })

  it('paints the canvas rather than leaving it blank', async () => {
    render(<TokenGallery />)
    const canvas = screen.getByLabelText<HTMLCanvasElement>(/canvas tokens/i)

    // One frame for the effect to measure and draw.
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve)
      })
    })

    expect(canvas.width).toBeGreaterThan(0)
    const context = canvas.getContext('2d')
    expect(context).not.toBeNull()
    const pixels = context?.getImageData(0, 0, canvas.width, canvas.height).data
    expect(pixels).toBeDefined()
    // A blank canvas is fully transparent; a painted one is not.
    const painted =
      pixels !== undefined && pixels.some((_value, index) => index % 4 === 3 && pixels[index] !== 0)
    expect(painted, 'the canvas drew nothing').toBe(true)
  })
})
