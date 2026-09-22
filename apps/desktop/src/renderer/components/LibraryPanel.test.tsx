import type { LibraryItem, LibraryQuery } from '@piano/ipc'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { clock, LibraryPanel } from './LibraryPanel'

/**
 * The library on screen, with main faked: what it asks for as somebody
 * narrows it, what a row says, and that picking one opens it.
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

function setup(found: LibraryItem[] = items) {
  const asked: LibraryQuery[] = []
  const opened: string[] = []
  /** How many times the other way in was taken: open a file, then file it. */
  let files = 0
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
    />,
  )
  return {
    asked,
    opened,
    files: () => files,
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

  it('writes a length as minutes and seconds', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(59.6)).toBe('1:00')
    expect(clock(125)).toBe('2:05')
  })
})
