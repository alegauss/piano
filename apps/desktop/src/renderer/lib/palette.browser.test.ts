import { beforeEach, describe, expect, it } from 'vitest'

import { APART_CONTRAST, contrastOf, OBJECT_CONTRAST, TEXT_CONTRAST, toRgb } from './contrast'
import {
  CANVAS_TOKENS,
  readCanvasPalette,
  setTheme,
  type CanvasToken,
  type ThemeName,
} from './theme'

/**
 * The palette, measured rather than admired.
 *
 * Every claim here is about colours as a browser actually resolves them, in
 * both themes, which is why it cannot be asked of jsdom: the tokens are
 * written in oklch and the question is what comes out the other end.
 */

const PARTS: readonly CanvasToken[] = [
  '--note-part-1',
  '--note-part-2',
  '--note-part-3',
  '--note-part-4',
]

/** The colours that carry meaning: what was expected, and what was played. */
const JUDGEMENTS: readonly CanvasToken[] = [
  '--judge-expected',
  '--judge-correct',
  '--judge-wrong',
  '--judge-late',
]

const THEMES: readonly ThemeName[] = ['dark', 'light']

function pairs<T>(items: readonly T[]): [T, T][] {
  const out: [T, T][] = []
  for (let one = 0; one < items.length; one += 1) {
    for (let other = one + 1; other < items.length; other += 1) {
      out.push([items[one] as T, items[other] as T])
    }
  }
  return out
}

function chrome(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim()
}

describe.each(THEMES)('the %s theme', (theme) => {
  beforeEach(() => {
    setTheme(theme)
  })

  it('shows every note against the field', () => {
    const palette = readCanvasPalette()
    for (const token of [...PARTS, ...JUDGEMENTS]) {
      expect(
        contrastOf(palette[token], palette['--roll-background']),
        `${token} against the field`,
      ).toBeGreaterThanOrEqual(OBJECT_CONTRAST)
    }
  })

  it('keeps the parts apart in grey, where hue has stopped helping', () => {
    const palette = readCanvasPalette()
    for (const [one, other] of pairs(PARTS)) {
      expect(contrastOf(palette[one], palette[other]), `${one} against ${other}`).toBeGreaterThan(
        APART_CONTRAST,
      )
    }
  })

  it('keeps right, wrong, late and expected apart in grey, since they carry the meaning', () => {
    const palette = readCanvasPalette()
    for (const [one, other] of pairs(JUDGEMENTS)) {
      expect(contrastOf(palette[one], palette[other]), `${one} against ${other}`).toBeGreaterThan(
        APART_CONTRAST,
      )
    }
  })

  it('reads its text', () => {
    expect(contrastOf(chrome('--text-default'), chrome('--surface-base'))).toBeGreaterThanOrEqual(
      TEXT_CONTRAST,
    )
    expect(contrastOf(chrome('--text-strong'), chrome('--surface-base'))).toBeGreaterThanOrEqual(
      TEXT_CONTRAST,
    )
    expect(contrastOf(chrome('--text-muted'), chrome('--surface-base'))).toBeGreaterThanOrEqual(
      OBJECT_CONTRAST,
    )
  })

  it('tells a white key from a black one, and a pressed key from an idle one', () => {
    const palette = readCanvasPalette()
    expect(contrastOf(palette['--key-white'], palette['--key-black'])).toBeGreaterThanOrEqual(
      TEXT_CONTRAST,
    )
    expect(contrastOf(palette['--key-white'], palette['--key-white-pressed'])).toBeGreaterThan(
      APART_CONTRAST,
    )
    expect(contrastOf(palette['--key-black'], palette['--key-black-pressed'])).toBeGreaterThan(
      APART_CONTRAST,
    )
  })

  it('gives the canvas exactly what the stylesheet gives the chrome', () => {
    const palette = readCanvasPalette()
    for (const token of CANVAS_TOKENS) {
      expect(palette[token], token).not.toBe('')
      expect(toRgb(palette[token]), token).toEqual(toRgb(chrome(token)))
    }
  })
})

describe('the two themes', () => {
  it('are each real rather than one inverted', () => {
    setTheme('dark')
    const dark = readCanvasPalette()
    setTheme('light')
    const light = readCanvasPalette()

    // A dark field and a light one, and note colours tuned separately rather
    // than flipped: a note that is bright on black is not the same colour as
    // one that has to hold its own on white.
    expect(contrastOf(dark['--roll-background'], 'white')).toBeGreaterThan(10)
    expect(contrastOf(light['--roll-background'], 'white')).toBeLessThan(1.3)
    for (const token of PARTS) {
      expect(toRgb(dark[token]), token).not.toEqual(toRgb(light[token]))
    }
  })
})
