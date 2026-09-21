import { render } from '@testing-library/react'
import { resolveTiming, type Note } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { SheetMusic } from './SheetMusic'

/**
 * The stave as VexFlow actually draws it.
 *
 * jsdom would pass this suite against nothing: it lays out no element, so the
 * panel would be measured at zero and the page would be planned empty, and it
 * renders no glyph, so a count of noteheads would count an empty document.
 * Here the panel has a width, the SVG is real, and the claims are about what
 * is in it.
 */

const timing = resolveTiming(undefined)
const QUARTER = timing.ticksPerQuarter
const BAR = QUARTER * 4
const WIDTH = 1100

/** Two bars of a right hand over a left, four figures to the bar. */
const TWO_BARS: readonly Note[] = [
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((beat) => ({
    pitch: 72,
    start: beat * QUARTER,
    duration: QUARTER,
    velocity: 80,
    hand: 'right' as const,
  })),
  { pitch: 48, start: 0, duration: BAR, velocity: 80, hand: 'left' as const },
  { pitch: 48, start: BAR, duration: BAR, velocity: 80, hand: 'left' as const },
]

/** Wait for the resize observer to report and the effect to draw. */
async function drawn() {
  for (let index = 0; index < 4; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
}

async function mount(notes: readonly Note[], musicKey?: string) {
  const { container } = render(
    <div style={{ width: WIDTH, height: 600 }}>
      <SheetMusic timing={timing} notes={notes} musicKey={musicKey} />
    </div>,
  )
  await drawn()
  const svg = container.querySelector('svg')
  return { container, svg }
}

describe('SheetMusic', () => {
  it('draws a stave per bar per clef, as an SVG with real size', async () => {
    const { svg } = await mount(TWO_BARS)
    expect(svg).not.toBeNull()
    // Two bars, two clefs: four staves, each five lines drawn as one path.
    expect(svg?.querySelectorAll('.vf-stave').length).toBe(4)
    expect(Number(svg?.getAttribute('width'))).toBeGreaterThan(0)
  })

  it('names the clef each hand is written in', async () => {
    const { svg } = await mount(TWO_BARS)
    // The clef glyph is drawn once per stave on the system's first bar only,
    // which is the pair a reader sees at the left edge.
    expect(svg?.querySelectorAll('.vf-clef').length).toBe(2)
  })

  it('draws a notehead for every note the score holds', async () => {
    const { svg } = await mount(TWO_BARS)
    const notes = svg?.querySelectorAll('.vf-stavenote') ?? []
    // Eight quarters in the right hand, two whole notes in the left, and no
    // rest anywhere: every bar is full in both hands.
    expect(notes.length).toBe(10)
  })

  it('draws a rest where the music stops before the barline', async () => {
    const half = [{ pitch: 60, start: 0, duration: BAR / 2, velocity: 80 }]
    const { svg } = await mount(half)
    // One note and one rest, both stave notes: the rest is the gap after it.
    expect(svg?.querySelectorAll('.vf-stavenote').length).toBe(2)
  })

  it('draws the key signature the metadata names', async () => {
    const withKey = await mount(TWO_BARS, 'Bb')
    const without = await mount(TWO_BARS, 'modal-ish')
    expect(withKey.svg?.querySelectorAll('.vf-keysignature').length).toBe(2)
    // A key nothing can read draws no signature rather than a wrong one.
    expect(without.svg?.querySelectorAll('.vf-keysignature').length).toBe(0)
  })

  it('reflows to a narrower panel instead of running off the edge', async () => {
    const eight = Array.from({ length: 8 }, (_unused, index) => ({
      pitch: 60,
      start: index * BAR,
      duration: BAR,
      velocity: 80,
    }))
    const { container, svg } = await mount(eight)
    const wide = Number(svg?.getAttribute('height'))

    const outer = container.firstElementChild as HTMLElement
    outer.style.width = '480px'
    await drawn()
    const narrow = Number(container.querySelector('svg')?.getAttribute('height'))
    // Fewer bars to a system is more systems, which is a taller page.
    expect(narrow).toBeGreaterThan(wide)
    expect(Number(container.querySelector('svg')?.getAttribute('width'))).toBeLessThan(
      Number(svg?.getAttribute('width')) + 1,
    )
  })

  it('says so rather than drawing an empty page when nothing is open', async () => {
    const { container, svg } = await mount([])
    expect(svg).toBeNull()
    expect(container.textContent).toContain('Nothing is open to read')
  })
})
