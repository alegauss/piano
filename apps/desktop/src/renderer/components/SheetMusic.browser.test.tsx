import { render } from '@testing-library/react'
import { resolveTiming, type Note } from '@piano/score-format'
import { Profiler } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FakeTime, Listener } from '../audio/test-doubles'
import { Transport } from '../audio/transport'
import { APART_CONTRAST, contrastOf, OBJECT_CONTRAST, TEXT_CONTRAST, toRgb } from '../lib/contrast'
import { setTheme, type ThemeName } from '../lib/theme'
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

/** The transport on a clock the test moves by hand, as the roll's suite drives it. */
function driven(notes: readonly Note[]) {
  const time = new FakeTime()
  const transport = new Transport(new Listener(time), time.clock, time.ticker)
  transport.load({ timing, notes })
  return { time, transport }
}

describe('SheetMusic, following the playhead', () => {
  it('marks the bar that is sounding, and moves the mark as the piece goes on', async () => {
    const { transport } = driven(TWO_BARS)
    const { container } = render(
      <div style={{ width: WIDTH, height: 600 }}>
        <SheetMusic timing={timing} notes={TWO_BARS} position={() => transport.position()} />
      </div>,
    )
    await drawn()
    const band = () => container.querySelector('[data-testid="sheet-band"]')
    expect(band()?.getAttribute('data-bar')).toBe('1')

    // Seeking is the transport's own arithmetic; the page follows it.
    transport.seek(BAR + QUARTER)
    await drawn()
    expect(band()?.getAttribute('data-bar')).toBe('2')
    expect((band() as HTMLElement | null)?.style.display).toBe('block')
  })

  it('colours the figure that is sounding, and lets go of it after', async () => {
    // A note in bar 1 and another in bar 3, so bar 2 is silence: a tick where
    // nothing at all should carry the mark.
    const spaced: readonly Note[] = [
      { pitch: 60, start: 0, duration: QUARTER, velocity: 80 },
      { pitch: 64, start: 2 * BAR, duration: QUARTER, velocity: 80 },
    ]
    const { transport } = driven(spaced)
    const { container } = render(
      <div style={{ width: WIDTH, height: 600 }}>
        <SheetMusic timing={timing} notes={spaced} position={() => transport.position()} />
      </div>,
    )
    await drawn()

    // The page says what a figure has become of and the stylesheet decides
    // what that looks like, so the mark is what this counts.
    const marked = () => container.querySelectorAll('.vf-stavenote[data-ink="--accent"]').length

    expect(marked()).toBeGreaterThan(0)

    transport.seek(BAR)
    await drawn()
    expect(marked()).toBe(0)

    transport.seek(2 * BAR)
    await drawn()
    expect(marked()).toBeGreaterThan(0)
  })

  it('turns the page when the sounding bar drops off the bottom', async () => {
    // Sixteen bars in a narrow, short panel: several systems, few in view.
    const long = Array.from({ length: 16 }, (_unused, index) => ({
      pitch: 60,
      start: index * BAR,
      duration: QUARTER,
      velocity: 80,
    }))
    const { transport } = driven(long)
    // A flex row, as App mounts it: min-h-0 and flex-1 are what bound the
    // panel's height, and an unbounded one grows to its content and scrolls
    // nothing.
    const { container } = render(
      <div style={{ width: 520, height: 260, display: 'flex' }}>
        <SheetMusic timing={timing} notes={long} position={() => transport.position()} />
      </div>,
    )
    await drawn()
    const panel = container.querySelector('section')
    expect(panel?.scrollTop).toBe(0)

    transport.seek(14 * BAR)
    await drawn()
    const turned = panel?.scrollTop ?? 0
    expect(turned).toBeGreaterThan(0)

    // Back to the top, and the page comes back with it.
    transport.seek(0)
    await drawn()
    expect(panel?.scrollTop ?? 0).toBeLessThan(turned)
  })

  it('engraves once and never again while the piece plays', async () => {
    const { time, transport } = driven(TWO_BARS)
    let commits = 0
    const { container } = render(
      <div style={{ width: WIDTH, height: 600 }}>
        <Profiler
          id="sheet"
          onRender={() => {
            commits += 1
          }}
        >
          <SheetMusic timing={timing} notes={TWO_BARS} position={() => transport.position()} />
        </Profiler>
      </div>,
    )
    await drawn()
    const settled = commits
    const svg = container.querySelector('svg')

    transport.play()
    time.run(1)
    await drawn()
    await drawn()

    // A second of music, sixty-odd frames, and React committed nothing: the
    // page is followed through the DOM, not re-rendered.
    expect(commits).toBe(settled)
    // The same SVG, so nothing was engraved a second time either.
    expect(container.querySelector('svg')).toBe(svg)
    // And the mark did move, so the loop was running throughout.
    expect(container.querySelector('[data-testid="sheet-band"]')).not.toBeNull()
  })
})

const THEMES: readonly ThemeName[] = ['dark', 'light']

/** A token as the document resolves it, which is what the page is measured against. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

describe.each(THEMES)('SheetMusic, engraved for the %s theme', (theme) => {
  beforeEach(() => {
    setTheme(theme)
  })

  afterEach(() => {
    setTheme('dark')
  })

  it('draws its ink and its stave lines in this theme’s tokens', async () => {
    const { svg } = await mount(TWO_BARS)
    const line = svg?.querySelector('.vf-stave > path')
    // Not a marked one: the transport sits at tick 0 here, so the figure on
    // the downbeat is sounding and carries the accent instead of the ink.
    const head = svg?.querySelector('.vf-stavenote:not([data-ink]) path')
    expect(line).not.toBeNull()
    expect(head).not.toBeNull()

    // What the browser resolves, not what VexFlow wrote: the library fills
    // black, and the stylesheet is what overrules it. Compared through toRgb
    // because a computed colour and a token are the same colour spelled two
    // ways.
    expect(toRgb(getComputedStyle(line as Element).stroke)).toEqual(
      toRgb(token('--sheet-stave-line')),
    )
    expect(toRgb(getComputedStyle(head as Element).fill)).toEqual(toRgb(token('--sheet-ink')))
  })

  it('keeps the stave lines under the ink rather than beside it', async () => {
    const { svg } = await mount(TWO_BARS)
    const ink = getComputedStyle(
      svg?.querySelector('.vf-stavenote:not([data-ink]) path') as Element,
    ).fill
    const line = getComputedStyle(svg?.querySelector('.vf-stave > path') as Element).stroke
    // The two are different colours, whichever way round the theme puts them.
    expect(ink).not.toBe(line)
    expect(contrastOf(token('--sheet-ink'), token('--surface-raised'))).toBeGreaterThanOrEqual(
      TEXT_CONTRAST,
    )
    expect(
      contrastOf(token('--sheet-stave-line'), token('--surface-raised')),
    ).toBeGreaterThanOrEqual(OBJECT_CONTRAST)
    expect(contrastOf(token('--sheet-ink'), token('--sheet-stave-line'))).toBeGreaterThan(
      APART_CONTRAST,
    )
  })

  it('marks a sounding note in this theme’s accent, from the token alone', async () => {
    const { transport } = driven(TWO_BARS)
    const { container } = render(
      <div style={{ width: WIDTH, height: 600 }}>
        <SheetMusic timing={timing} notes={TWO_BARS} position={() => transport.position()} />
      </div>,
    )
    await drawn()
    const marked = container.querySelector('.vf-stavenote[data-ink="--accent"] path')
    expect(marked).not.toBeNull()
    expect(toRgb(getComputedStyle(marked as Element).fill)).toEqual(toRgb(token('--accent')))
  })
})

describe('the music font', () => {
  it('comes from the bundle, so the page draws glyphs with no network', async () => {
    await mount(TWO_BARS)
    await document.fonts.ready
    // VexFlow would otherwise fetch Bravura from a CDN, and this renderer is
    // sandboxed and has to work offline.
    expect(document.fonts.check('40px Bravura')).toBe(true)
  })
})
