import type { LibraryItem, LibraryQuery } from '@piano/ipc'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LibraryPanel } from './LibraryPanel'

/**
 * A row of the library, measured.
 *
 * The defect this guards against was invisible to jsdom: a score written for
 * this app carries a sentence in `composer` rather than a name, and the chips
 * holding it refused to give ground, so the title beside them was squeezed to
 * nothing and the row's own length line broke a word to a line. Every claim
 * below is a width the browser worked out, which is why it is not in the
 * jsdom test next door.
 */

const SENTENCE = 'Original, written in the style of 8-bit platformer overworld music'

const items: LibraryItem[] = [
  {
    id: 'overworld-dash',
    title: 'Overworld Dash',
    composer: SENTENCE,
    level: 'intermediate',
    difficulty: 5,
    tags: ['original', 'chiptune-style', 'platformer', 'c-major', 'upbeat'],
    seconds: 45,
    added: 2,
  },
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    composer: 'Beethoven',
    level: 'beginner',
    difficulty: 1,
    tags: ['classical'],
    seconds: 38,
    added: 1,
  },
]

async function open(): Promise<void> {
  render(
    <LibraryPanel
      search={(_query: LibraryQuery) => Promise.resolve(items)}
      changes={() => () => undefined}
      onOpen={() => undefined}
      onOpenFile={() => undefined}
      leftBehind={() => Promise.resolve([])}
      onOpenLeft={() => undefined}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Library' }))
  await screen.findByText('Overworld Dash')
}

/** The row a piece of text sits in. */
function row(text: string): HTMLElement {
  const found = screen.getByText(text).closest('li')
  if (found === null) {
    throw new Error(`"${text}" is not in a row`)
  }
  return found
}

describe('a library row, laid out by a real browser', () => {
  it('keeps the title readable beside a composer that is a sentence', async () => {
    await open()
    const title = screen.getByText('Overworld Dash')

    expect(title.clientWidth).toBeGreaterThan(row('Overworld Dash').clientWidth * 0.4)
    expect(title.scrollWidth, 'the title is cut off').toBeLessThanOrEqual(title.clientWidth)
  })

  it('keeps the level, difficulty and length on one line', async () => {
    await open()
    const long = screen.getByText('intermediate · 5/10 · 0:45')
    const short = screen.getByText('beginner · 1/10 · 0:38')

    expect(long.getBoundingClientRect().height).toBeCloseTo(short.getBoundingClientRect().height, 1)
  })

  it('does not push the list sideways', async () => {
    await open()
    const list = screen.getByRole('list', { name: 'Scores in the library' })

    expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth + 1)
  })
})
