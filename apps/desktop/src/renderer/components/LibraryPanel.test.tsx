import type {
  LibraryCorrectResult,
  LibraryItem,
  LibraryLeft,
  LibraryQuery,
  LibraryRemoveResult,
} from '@piano/ipc'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Filing } from '../lib/library'
import { LibraryPanel } from './LibraryPanel'

/**
 * The library on screen, with main faked: what it asks for as somebody
 * narrows it, what a row says, that picking one opens it, and that correcting
 * one writes back what the form holds.
 */

const items: LibraryItem[] = [
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    composer: 'Beethoven',
    level: 'beginner',
    difficulty: 1,
    tags: ['classical'],
    seconds: 30,
    added: 2,
  },
  { id: 'etude', title: 'Étude', level: 'advanced', tags: [], seconds: 125, added: 1 },
]

function setup(
  found: LibraryItem[] = items,
  left: LibraryLeft[] = [],
  /** What main answers a correction with, or what it answers the nth one with. */
  answer: LibraryCorrectResult | ((attempt: number) => LibraryCorrectResult) = {
    kind: 'corrected',
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    score: null,
    open: false,
  },
  gone: LibraryRemoveResult = { kind: 'removed', id: 'ode-to-joy' },
) {
  const asked: LibraryQuery[] = []
  const opened: string[] = []
  /** How many times the other way in was taken: open a file, then file it. */
  let files = 0
  /** The names of files the folder would not take in, opened from the panel. */
  const openedLeft: string[] = []
  /** Every correction the panel asked main to write. */
  const corrected: { id: string; filing: Filing; taken?: 'beside' | 'replace' }[] = []
  /** Every id the panel asked main to take out of the library. */
  const removed: string[] = []
  let changed: (() => void) | null = null
  render(
    <LibraryPanel
      search={(query) => {
        asked.push(query)
        return Promise.resolve(found)
      }}
      changes={(listener) => {
        changed = listener
        return () => {
          changed = null
        }
      }}
      onOpen={(id) => {
        opened.push(id)
      }}
      onOpenFile={() => {
        files += 1
      }}
      leftBehind={() => Promise.resolve(left)}
      onOpenLeft={(name) => {
        openedLeft.push(name)
      }}
      onCorrect={(id, filing, taken) => {
        corrected.push({ id, filing, ...(taken === undefined ? {} : { taken }) })
        return Promise.resolve(typeof answer === 'function' ? answer(corrected.length) : answer)
      }}
      onRemove={(id) => {
        removed.push(id)
        return Promise.resolve(gone)
      }}
    />,
  )
  return {
    asked,
    opened,
    files: () => files,
    openedLeft,
    corrected,
    removed,
    change: () => {
      act(() => {
        changed?.()
      })
    },
  }
}

describe('the library on screen', () => {
  it('lists newest first, saying how hard and how long each piece is', async () => {
    const { asked } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    expect(await screen.findByText('Ode to Joy')).toBeInTheDocument()
    expect(screen.getByText('beginner · 1/10 · 0:30')).toBeInTheDocument()
    expect(screen.getByText('advanced · 2:05')).toBeInTheDocument()
    expect(asked[0]).toEqual({ order: 'newest' })
  })

  it('narrows by words, level, tag and composer, and orders by difficulty on request', async () => {
    const { asked } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    await screen.findByText('Ode to Joy')

    fireEvent.change(screen.getByLabelText('Search the library'), { target: { value: 'ode' } })
    fireEvent.click(screen.getByRole('button', { name: 'Beginner' }))
    fireEvent.click(screen.getByRole('button', { name: 'Only scores with the tag classical' }))
    fireEvent.click(screen.getByRole('button', { name: 'Only scores with the composer Beethoven' }))
    fireEvent.click(screen.getByRole('button', { name: 'Easiest first' }))
    await screen.findByText('Ode to Joy')

    expect(asked.at(-1)).toEqual({
      order: 'easiest',
      text: 'ode',
      level: 'beginner',
      tags: ['classical'],
      composer: 'Beethoven',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stop filtering by Tag: classical' }))
    expect(asked.at(-1)).not.toHaveProperty('tags')
  })

  it('opens the score picked, by its library id', async () => {
    const { opened } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    fireEvent.click(await screen.findByText('Étude'))
    expect(opened).toEqual(['etude'])
  })

  it('asks again when the folder changes while it is open', async () => {
    const { asked, change } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    await screen.findByText('Ode to Joy')
    const before = asked.length
    change()
    await screen.findByText('Ode to Joy')
    expect(asked.length).toBe(before + 1)
  })

  it('names both ways into an empty library, and offers the second as a door', async () => {
    const { files } = setup([])
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))

    const said = await screen.findByText(/The library is empty/)
    expect(said).toHaveTextContent('/piano:compose')
    expect(said).toHaveTextContent('a file you already have')

    // Nobody goes looking for a button in the header on the strength of a
    // sentence about one, so the sentence is the button.
    fireEvent.click(screen.getByRole('button', { name: 'Open a file' }))
    expect(files()).toBe(1)
  })

  it('offers nothing to open when it is a search that found nothing', async () => {
    setup([])
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    fireEvent.change(screen.getByLabelText('Search the library'), { target: { value: 'ode' } })

    expect(await screen.findByText('Nothing in the library matches.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open a file' })).toBeNull()
  })

  it('says what the folder would not take in, and offers the ones that open', async () => {
    const { openedLeft } = setup(items, [
      { name: 'broken.mid', why: 'it is not a MIDI file this app can read', opens: false },
      { name: 'prelude.mid', why: 'the library already has a prelude', opens: true },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    await screen.findByText('Ode to Joy')

    expect(screen.getByText('2 files in the folder were not taken in')).toBeInTheDocument()
    expect(screen.getByText('it is not a MIDI file this app can read')).toBeInTheDocument()

    // Only the file that reads can be opened: what stopped it was its name,
    // and that is a question the filing form asks once the piece is open.
    const doors = screen.getAllByRole('button', { name: 'Open it' })
    expect(doors).toHaveLength(1)
    fireEvent.click(doors[0] as HTMLElement)
    expect(openedLeft).toEqual(['prelude.mid'])
  })

  it('says nothing about the folder when it took everything in', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    await screen.findByText('Ode to Joy')
    expect(screen.queryByLabelText('Files the library did not take in')).toBeNull()
  })
})

describe('correcting a piece from its row', () => {
  /** Open the panel and the form on the first row, which is where every test below starts. */
  async function correcting(...args: Parameters<typeof setup>) {
    const held = setup(...args)
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Correct Ode to Joy' }))
    return held
  }

  it('opens the filing form with what the row already says', async () => {
    await correcting()

    expect(screen.getByLabelText('Title')).toHaveValue('Ode to Joy')
    expect(screen.getByLabelText('Composer')).toHaveValue('Beethoven')
    expect(screen.getByRole('button', { name: 'Beginner', pressed: true })).toBeInTheDocument()
    expect(screen.getByLabelText('Difficulty')).toHaveValue('1')
    expect(screen.getByLabelText('Tags')).toHaveValue('classical')
  })

  it('asks for difficulty, which filing has nobody to ask and nothing else can set', async () => {
    await correcting()
    fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save it' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Difficulty')).toBeNull()
    })
  })

  it('writes the corrected form back under the row’s id, and asks for the list again', async () => {
    const { corrected, asked } = await correcting()
    const before = asked.length

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Ode an die Freude' } })
    fireEvent.change(screen.getByLabelText('Composer'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save it' }))

    await waitFor(() => {
      expect(asked.length).toBeGreaterThan(before)
    })
    expect(corrected).toEqual([
      {
        id: 'ode-to-joy',
        filing: {
          title: 'Ode an die Freude',
          composer: '',
          level: 'beginner',
          difficulty: '1',
          tags: 'classical',
        },
      },
    ])
  })

  it('says up front that a new title moves the piece', async () => {
    await correcting()
    expect(screen.getByText(/a new title moves it to the name that title gives it/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'File this one beside it' })).toBeNull()
  })

  it('says where a retitled piece is filed now, and under what it no longer is', async () => {
    await correcting(items, [], {
      kind: 'corrected',
      id: 'ode-an-die-freude',
      title: 'Ode an die Freude',
      score: null,
      open: false,
    })

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Ode an die Freude' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save it' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ode an die Freude is filed as ode-an-die-freude now, not ode-to-joy. Anything still asking for the old name will not find it.',
    )
  })

  it('says nothing about a name when the piece did not move', async () => {
    const { asked } = await correcting()
    const before = asked.length

    fireEvent.click(screen.getByRole('button', { name: 'Save it' }))

    await waitFor(() => {
      expect(asked.length).toBeGreaterThan(before)
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('asks about the name a new title wants when something else holds it', async () => {
    const { corrected } = await correcting(items, [], (attempt) =>
      attempt === 1
        ? {
            kind: 'taken',
            id: 'etude',
            held: { title: 'Étude', composer: 'Chopin', seconds: 125 },
          }
        : { kind: 'corrected', id: 'etude-2', title: 'Étude', score: null, open: false },
    )

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Étude' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save it' }))

    // Described rather than named: the choice is between two pieces.
    expect(await screen.findByText('The library already has a etude')).toBeInTheDocument()
    expect(screen.getByText(/Étude · Chopin · 2:05/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'File this one beside it' }))

    await waitFor(() => {
      expect(corrected).toHaveLength(2)
    })
    expect(corrected[1]).toMatchObject({ id: 'ode-to-joy', taken: 'beside' })
  })

  it('keeps the form open with the reason when the correction was refused', async () => {
    const { asked } = await correcting(items, [], {
      kind: 'refused',
      message: 'nothing is filed as ode-to-joy any more',
    })
    const before = asked.length

    fireEvent.click(screen.getByRole('button', { name: 'Save it' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That could not be saved: nothing is filed as ode-to-joy any more.',
    )

    expect(screen.getByLabelText('Title')).toHaveValue('Ode to Joy')
    expect(asked.length).toBe(before)
  })
})

describe('deleting a piece from its row', () => {
  /** Open the panel and press delete on the first row, which asks the question. */
  async function deleting(...args: Parameters<typeof setup>) {
    const held = setup(...args)
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Ode to Joy' }))
    return held
  }

  it('asks once, naming the piece rather than the id it is filed under', async () => {
    const { removed } = await deleting()

    expect(screen.getByText('Delete this piece?')).toBeInTheDocument()
    expect(screen.getByText('Ode to Joy · Beethoven · 0:30')).toBeInTheDocument()
    // Somewhere to put a wrong click back from, said before it is made.
    expect(screen.getByText(/It goes to the bin/)).toBeInTheDocument()
    expect(removed).toEqual([])
  })

  it('takes nothing away when the answer is to keep it', async () => {
    const { removed } = await deleting()
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))

    await waitFor(() => {
      expect(screen.queryByText('Delete this piece?')).toBeNull()
    })
    expect(removed).toEqual([])
  })

  it('takes the piece away by its id and asks for the list again', async () => {
    const { removed, asked } = await deleting()
    const before = asked.length

    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }))

    await waitFor(() => {
      expect(asked.length).toBeGreaterThan(before)
    })
    expect(removed).toEqual(['ode-to-joy'])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says why where the list is when nothing was taken away', async () => {
    await deleting(items, [], undefined, {
      kind: 'refused',
      message: 'nothing is filed as ode-to-joy',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That could not be deleted: nothing is filed as ode-to-joy.',
    )
    expect(screen.queryByText('Delete this piece?')).toBeNull()
  })
})
