import type { OpenRequest, OpenResult, PianoBridge } from '@piano/ipc'
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

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

/**
 * Main, as the window sees it: every answer to an open is decided by the
 * test, and a score opened from outside the page is pushed when it says so.
 */
function fakeMain(launch: OpenResult = { kind: 'none' }) {
  let listener: ((result: OpenResult) => void) | null = null
  const asked: OpenRequest[] = []
  const bridge: PianoBridge = {
    appInfo: () =>
      Promise.resolve({ electron: '0', chrome: '0', node: '0', scoreFormatVersion: 1 }),
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
    onLibraryChanged: () => () => {},
  }
  Object.defineProperty(window, 'piano', { value: bridge, configurable: true })
  return {
    asked,
    push: async (result: OpenResult) => {
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
