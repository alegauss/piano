import type { OpenRequest } from '@piano/ipc'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { OpenControls } from './OpenControls'

/**
 * The window's own way to open a score: the dialog, and the recent list read
 * fresh each time it is shown, each entry opening by the path it holds.
 */

function setup(recent = [{ path: '/music/aria.json', name: 'aria.json', title: 'Aria' }]) {
  const asked: OpenRequest[] = []
  render(
    <OpenControls
      open={(request) => {
        asked.push(request)
      }}
      recent={() => Promise.resolve(recent)}
    />,
  )
  return { asked }
}

describe('opening from the window', () => {
  it('asks for the dialog', () => {
    const { asked } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Open…' }))
    expect(asked).toEqual([{ from: 'dialog' }])
  })

  it('opens a recent score by the path the list holds', async () => {
    const { asked } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Recent' }))
    fireEvent.click(await screen.findByText('Aria'))
    expect(asked).toEqual([{ from: 'recent', path: '/music/aria.json' }])
  })

  it('says how to open something when nothing has been', async () => {
    setup([])
    fireEvent.click(screen.getByRole('button', { name: 'Recent' }))
    expect(await screen.findByText(/Nothing opened yet/)).toBeInTheDocument()
  })
})
