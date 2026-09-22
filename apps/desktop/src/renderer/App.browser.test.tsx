import { DEFAULT_SETTINGS, type OpenRequest, type OpenResult, type PianoBridge } from '@piano/ipc'
import { isRulesWork, keepArrangement, type Arrangement, type Score } from '@piano/score-format'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { App } from './App'
import { appSettings } from './lib/settings'

// A level chosen in one test is remembered, as it would be across launches;
// each test starts from the defaults instead.
afterEach(async () => {
  await appSettings().reset()
})

/**
 * The whole app, in a browser, because this is where the pieces meet: one
 * transport, the roll reading it, the bar driving it, and a mode that takes
 * everything else away. It needs a real AudioContext and a real layout, so
 * jsdom cannot answer it.
 */

function parts() {
  return {
    roll: screen.queryByLabelText('Falling notes'),
    sheet: screen.queryByLabelText('Sheet music'),
    keyboard: screen.queryByLabelText('Piano keyboard, 88 keys'),
    bar: screen.queryByLabelText('Transport'),
    heading: screen.queryByRole('heading', { name: 'Piano' }),
    footer: screen.queryByTestId('app-version'),
    panel: screen.queryByLabelText('Parts'),
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

  it('sets every knob a level names when one is chosen', async () => {
    render(<App />)
    screen.getByLabelText('Level').click()
    await screen.findByText('Level', { selector: 'h2' })
    screen.getByText('Beginner').click()
    await new Promise((resolve) => requestAnimationFrame(resolve))

    // Two thirds of the written 120, the score waiting, and the right hand
    // left for the player while the app keeps the bass.
    expect(screen.getByTestId('Tempo').textContent).toBe('80 bpm')
    expect(screen.getByLabelText('Wait for me').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('knob-hands-you-play').textContent).toContain('right')
    expect(screen.getByTestId('knob-tempo').textContent).not.toContain('moved')
  })

  it('leaves only the roll and the keyboard in full screen, and comes back on escape', async () => {
    render(<App />)
    expect(parts().heading).not.toBeNull()
    expect(parts().footer).not.toBeNull()

    screen.getByLabelText('Full screen').click()
    await new Promise((resolve) => requestAnimationFrame(resolve))

    const full = parts()
    expect(full.roll).not.toBeNull()
    expect(full.keyboard).not.toBeNull()
    // The bar stays: it is how someone playing gets back out.
    expect(full.bar).not.toBeNull()
    expect(full.heading).toBeNull()
    expect(full.footer).toBeNull()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(parts().heading).not.toBeNull()
  })

  it('swaps the centre of the window between the roll and the stave', async () => {
    render(<App />)
    expect(parts().roll).not.toBeNull()
    expect(parts().sheet).toBeNull()

    screen.getByLabelText('Show the sheet music').click()
    // Awaited rather than polled for a frame: the stave is a lazy import, so
    // the panel arrives when the chunk does.
    await screen.findByLabelText('Sheet music')

    const reading = parts()
    expect(reading.sheet).not.toBeNull()
    expect(reading.roll).toBeNull()
    // The parts panel and the bar belong to the piece, not to how it is drawn.
    expect(reading.panel).not.toBeNull()
    expect(reading.bar).not.toBeNull()

    screen.getByLabelText('Show the falling notes').click()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(parts().roll).not.toBeNull()
    expect(parts().sheet).toBeNull()
  })

  it('magnifies the page from the bar’s own slider', async () => {
    // The whole path, which is the one nothing else covers: the control at one
    // end, the glyphs at the other, the settings store in between. The stave
    // magnified correctly all along and App never told it to.
    render(<App />)
    screen.getByLabelText('Show the sheet music').click()
    const panel = await screen.findByLabelText('Sheet music')
    // The panel arrives before the page is on it: the width is measured, then
    // planned, then drawn, which is a few frames after the panel mounts.
    const width = () => Number(panel.querySelector('svg')?.getAttribute('width'))
    await waitFor(() => {
      expect(width()).toBeGreaterThan(0)
    })
    const before = width()

    // Radix answers to the keyboard on its thumb, as the scrubber test does,
    // which is steadier than dragging.
    const slider = screen.getByLabelText('How large the stave is drawn')
    const thumb = slider.querySelector('[role="slider"]') ?? slider
    act(() => {
      thumb.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    })
    for (let press = 0; press < 10; press += 1) {
      act(() => {
        thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      })
    }
    await waitFor(() => {
      expect(width()).toBeGreaterThan(before)
    })
  })

  it('shows the roll its own slider, not the stave’s', async () => {
    // One magnifier serves both views, so which slider is under it is a thing
    // that can swap quietly.
    render(<App />)
    expect(screen.queryByLabelText('Seconds of music on screen')).not.toBeNull()
    expect(screen.queryByLabelText('How large the stave is drawn')).toBeNull()

    screen.getByLabelText('Show the sheet music').click()
    await screen.findByLabelText('Sheet music')
    expect(screen.queryByLabelText('How large the stave is drawn')).not.toBeNull()
    expect(screen.queryByLabelText('Seconds of music on screen')).toBeNull()
  })

  it('takes the reading from the settings rather than starting fresh', async () => {
    render(<App />)
    screen.getByLabelText('Show the sheet music').click()
    await screen.findByLabelText('Sheet music')

    // Mounted again, the window reads the setting instead of its own initial
    // state, which is the half of "reopens as you left it" that is here. That
    // the setting survives the file is settled in the ipc suite, since this
    // page has no bridge to write one.
    cleanup()
    render(<App />)
    await screen.findByLabelText('Sheet music')
    expect(parts().roll).toBeNull()
  })
})

/**
 * Main, as the window sees it: every answer to an open is decided by the
 * test, and a score opened from outside the page is pushed when it says so.
 */
function fakeMain(launch: OpenResult = { kind: 'none' }) {
  let listener: ((result: OpenResult) => void) | null = null
  const asked: OpenRequest[] = []
  const kept: unknown[] = []
  /** Every score the window asked to be put in the library. */
  const filed: unknown[] = []
  /** What is in the library, by the id it is filed under. */
  const library = new Map<string, { readonly title: string; readonly composer?: string }>()
  /** What the folder holds that was never taken in, as the sweep found it. */
  const left: { name: string; why: string; opens: boolean }[] = []
  /** The score file the window has open, as main would hold it. */
  let held: Score | null = null
  const bridge: PianoBridge = {
    appInfo: () =>
      Promise.resolve({
        app: '0.1.0',
        electron: '0',
        chrome: '0',
        node: '0',
        scoreFormatVersion: 1,
      }),
    setWindowTitle: (request) => Promise.resolve(request),
    packManifest: () => Promise.resolve({ installed: false, location: 'nowhere' }),
    packFile: () => Promise.reject(new Error('no pack in this test')),
    onLinkCommand: () => () => {},
    answerLinkCommand: () => Promise.resolve(null),
    openScore: (request) => {
      asked.push(request)
      return Promise.resolve(request.from === 'launch' ? launch : { kind: 'none' })
    },
    openDroppedFile: () => Promise.resolve({ kind: 'none' }),
    recentScores: () => Promise.resolve([]),
    onScoreOpened: (next) => {
      listener = next
      return () => {
        listener = null
      }
    },
    libraryScores: () => Promise.resolve([]),
    libraryLeftBehind: () => Promise.resolve(left),
    // A library of titles by id, which is enough for the one thing the window
    // decides about filing: what to do when the id is already somebody's.
    saveToLibrary: ({ score, taken }) => {
      const metadata = (score as Score | undefined)?.metadata
      const title = metadata?.title ?? 'that'
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const there = library.get(id)
      if (there !== undefined && taken === undefined) {
        return Promise.resolve({ kind: 'taken', id, held: { ...there, seconds: 95 } })
      }
      const under = taken === 'beside' ? `${id}-2` : id
      filed.push(score)
      library.set(under, {
        title,
        ...(metadata?.composer === undefined ? {} : { composer: metadata.composer }),
      })
      return Promise.resolve({ kind: 'filed', id: under, title })
    },
    onLibraryChanged: () => () => {},
    readSettings: () => Promise.resolve({ settings: DEFAULT_SETTINGS, notice: null, fresh: false }),
    writeSettings: () => Promise.resolve(DEFAULT_SETTINGS),
    resetSettings: () => Promise.resolve(DEFAULT_SETTINGS),
    readHistory: () => Promise.resolve({ records: [], dropped: 0, notice: null, fresh: false }),
    writeHistory: () => Promise.resolve(null),
    saveHistory: () => Promise.resolve({ kind: 'cancelled' }),
    clearHistory: () => Promise.resolve(null),
    packSource: () => Promise.resolve({ available: false, reason: 'not in this test' }),
    downloadPack: () => Promise.resolve({ installed: false, reason: 'not in this test' }),
    cancelPackDownload: () => Promise.resolve(null),
    onPackProgress: () => () => {},
    exportScore: () => Promise.resolve({ kind: 'cancelled' }),
    keepArrangement: ({ arrangement }) => {
      kept.push(arrangement)
      if (held === null) {
        return Promise.resolve({ kind: 'refused', message: 'nothing open' })
      }
      const next = keepArrangement(held.arrangements ?? [], arrangement as Arrangement)
      if (!next.kept) {
        return Promise.resolve({ kind: 'refused', message: next.reason })
      }
      held = { ...held, arrangements: next.arrangements }
      return Promise.resolve({ kind: 'kept', name: 'chords.score.json', score: held })
    },
    onExportRequested: () => () => {},
  }
  Object.defineProperty(window, 'piano', { value: bridge, configurable: true })
  return {
    asked,
    kept,
    filed,
    left,
    push: async (result: OpenResult) => {
      if (result.kind === 'opened') {
        held = result.score as Score
      }
      await act(async () => {
        listener?.(result)
        await new Promise((resolve) => requestAnimationFrame(resolve))
      })
    },
  }
}

const aria = {
  formatVersion: 1,
  metadata: { title: 'Aria', composer: 'Somebody' },
  notes: [{ pitch: 67, start: 0, duration: 480, velocity: 70 }],
}

/** What the header says is open. Read behind a dialog too, which hides the page from roles. */
const heading = () =>
  screen.getByRole('heading', { name: 'Piano', hidden: true }).nextElementSibling?.textContent

describe('opening a score in the window', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'piano')
  })

  it('asks for what it was launched with, and opens it', async () => {
    const main = fakeMain({ kind: 'opened', name: 'aria.json', score: aria, notices: [] })
    render(<App />)
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    expect(main.asked).toContainEqual({ from: 'launch' })
    expect(heading()).toContain('Aria')
    // The release, where a person looks when the link says which side is older.
    expect(screen.getByTestId('app-version').textContent).toBe('Piano 0.1.0')
  })

  it('replaces the piece with one opened from outside the page', async () => {
    const main = fakeMain()
    render(<App />)
    expect(heading()).toContain('Nothing loaded')
    await main.push({ kind: 'opened', name: 'aria.json', score: aria, notices: [] })
    expect(heading()).toContain('Aria')
  })

  it('leaves the open piece exactly as it was when a file is refused, and says why', async () => {
    const main = fakeMain()
    render(<App />)
    await main.push({ kind: 'opened', name: 'aria.json', score: aria, notices: [] })
    await main.push({
      kind: 'refused',
      name: 'broken.json',
      message: 'notes.0.pitch: expected a MIDI pitch',
      problems: [
        {
          kind: 'out of range',
          path: 'notes.0.pitch',
          received: '200',
          expected: 'a MIDI pitch from 0 to 127',
        },
      ],
    })

    expect(heading()).toContain('Aria')
    expect(screen.getByText('Could not open broken.json')).toBeTruthy()
    expect(screen.getByText(/is still open/)).toBeTruthy()
    expect(screen.getByText('Needs a MIDI pitch from 0 to 127.')).toBeTruthy()
  })
})

const addToLibrary = () => screen.queryByRole('button', { name: 'Add to library', hidden: true })

/** Click a button the filing form shows, by the words on it. */
async function press(name: string) {
  await act(async () => {
    screen.getByRole('button', { name, hidden: true }).click()
    await new Promise((resolve) => requestAnimationFrame(resolve))
  })
}

/** One of the form's fields, by the label above it. */
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label)

/** Type into one of the form's fields, as somebody filling it in would. */
function type(label: string, text: string) {
  const typed = field(label)
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.bind(
      typed,
    )
    setter?.(text)
    typed.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Open the form on whatever is open, which the header button does. */
async function openFiling() {
  await act(async () => {
    addToLibrary()?.click()
    await new Promise((resolve) => requestAnimationFrame(resolve))
  })
}

describe('putting the open piece in the library', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'piano')
  })

  it('offers nothing to file until something is open', () => {
    fakeMain()
    render(<App />)
    expect(addToLibrary()).toBeNull()
  })

  it('asks for what the file could not say, prefilled with what it did', async () => {
    const main = fakeMain()
    render(<App />)
    // An import: the score is in memory and in no file the app can reopen.
    await main.push({ kind: 'opened', name: 'aria.mid', score: aria, notices: [] })
    await openFiling()

    expect(field('Title').value).toBe('Aria')
    expect(field('Composer').value).toBe('Somebody')
    expect(field('Tags').value).toBe('')
    // Nothing is filed by opening the form.
    expect(main.filed).toHaveLength(0)

    type('Composer', 'J. S. Bach')
    type('Tags', 'baroque, study')
    await press('Beginner')
    await press('Add it')

    expect(main.filed).toHaveLength(1)
    expect((main.filed[0] as Score).metadata).toEqual({
      title: 'Aria',
      composer: 'J. S. Bach',
      level: 'beginner',
      tags: ['baroque', 'study'],
    })
    expect(screen.getByText(/Added Aria to the library, as aria\./)).toBeTruthy()
  })

  it('sends the notes and everything else the score carries, untouched', async () => {
    const main = fakeMain()
    render(<App />)
    await main.push({ kind: 'opened', name: 'aria.mid', score: aria, notices: [] })
    await openFiling()
    await press('Add it')

    expect((main.filed[0] as Score).notes).toEqual(aria.notes)
  })

  it('asks before replacing a piece already filed under that id, and files beside it', async () => {
    const main = fakeMain()
    render(<App />)
    await main.push({ kind: 'opened', name: 'aria.mid', score: aria, notices: [] })
    await openFiling()
    await press('Add it')

    // A different piece a MIDI file happens to call the same thing.
    await main.push({
      kind: 'opened',
      name: 'aria-2.mid',
      score: { ...aria, metadata: { title: 'Aria', composer: 'Somebody else' } },
      notices: [],
    })
    await openFiling()
    await press('Add it')

    // Nothing was filed twice: what is there is described, in the same form,
    // and the choice is open.
    expect(main.filed).toHaveLength(1)
    expect(screen.getByText('The library already has a aria')).toBeTruthy()
    expect(screen.getByText(/Aria · Somebody · 1:35/)).toBeTruthy()
    expect(screen.getByLabelText('Composer')).toBeTruthy()

    await press('File this one beside it')

    expect(main.filed).toHaveLength(2)
    expect(screen.getByText(/Added Aria to the library, as aria-2\./)).toBeTruthy()
  })
})

/** Three notes at once in one hand, which a beginner plays one of. */
const chords = {
  formatVersion: 1,
  metadata: { title: 'Chords' },
  notes: [
    { id: 'a', pitch: 72, start: 0, duration: 480, velocity: 80, hand: 'right' },
    { id: 'b', pitch: 76, start: 0, duration: 480, velocity: 80, hand: 'right' },
    { id: 'c', pitch: 79, start: 0, duration: 480, velocity: 80, hand: 'right' },
  ],
}

const keepButton = () =>
  screen.queryByRole('button', { name: 'Keep this version in the score', hidden: true })

async function chooseBeginner() {
  screen.getByLabelText('Level').click()
  await screen.findByText('Level', { selector: 'h2' })
  await act(async () => {
    screen.getByText('Beginner').click()
    await new Promise((resolve) => requestAnimationFrame(resolve))
  })
}

describe('keeping a worked-out version in the score', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'piano')
  })

  it('writes the proposal into the open file, and plays the kept one from then on', async () => {
    const main = fakeMain()
    render(<App />)
    await main.push({ kind: 'opened', name: 'chords.score.json', score: chords, notices: [] })
    await chooseBeginner()
    expect(screen.getByText(/Worked out from the rules/)).toBeTruthy()

    await act(async () => {
      keepButton()?.click()
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })

    expect(main.kept).toHaveLength(1)
    const sent = main.kept[0] as Arrangement
    expect(sent.level).toBe('beginner')
    expect(isRulesWork(sent)).toBe(true)
    expect(screen.getByText(/Kept the beginner version in chords\.score\.json/)).toBeTruthy()
    // The score now carries it, so the level says so and offers nothing more to keep.
    expect(screen.getByText(/Kept in the score as the rules worked it out/)).toBeTruthy()
    expect(keepButton()).toBeNull()
  })

  it('offers nothing to keep where there is no score file to keep it in', async () => {
    const main = fakeMain()
    render(<App />)
    await chooseBeginner()
    expect(keepButton()).toBeNull()

    await main.push({ kind: 'opened', name: 'chords.mid', score: chords, notices: [] })
    expect(keepButton()).toBeNull()
  })
})
