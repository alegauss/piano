import type { Hand, Part } from '@piano/score-format'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NOTHING_TOUCHED, type PartsView } from '../lib/parts'
import type { CanvasToken } from '../lib/theme'
import { PartsPanel } from './PartsPanel'

const parts: Part[] = [
  { id: 'right', name: 'Melody' },
  { id: 'left', name: 'Bass' },
]
const colours = new Map<string, CanvasToken>([
  ['right', '--note-part-1'],
  ['left', '--note-part-2'],
])
const hands: Hand[] = ['left', 'right']

function setup(view: PartsView = NOTHING_TOUCHED) {
  const onView = vi.fn()
  render(<PartsPanel parts={parts} colours={colours} hands={hands} view={view} onView={onView} />)
  return { onView }
}

describe('PartsPanel', () => {
  it('lists a row per part and a row per hand the piece writes for', () => {
    setup()
    expect(screen.getByText('Melody')).toBeTruthy()
    expect(screen.getByText('Bass')).toBeTruthy()
    expect(screen.getByText('Left hand')).toBeTruthy()
    expect(screen.getByText('Right hand')).toBeTruthy()
  })

  it('offers no hands for a piece that assigns none', () => {
    const onView = vi.fn()
    render(
      <PartsPanel
        parts={parts}
        colours={colours}
        hands={[]}
        view={NOTHING_TOUCHED}
        onView={onView}
      />,
    )
    expect(screen.queryByText('Left hand')).toBeNull()
  })

  it('silences and shows a part through separate controls', () => {
    const { onView } = setup()
    fireEvent.click(screen.getByLabelText('Silence Bass'))
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ muted: ['left'] }))

    fireEvent.click(screen.getByLabelText('Hide Bass'))
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ hidden: ['left'] }))
  })

  it('names what a control will do next, not what it did', () => {
    setup({ ...NOTHING_TOUCHED, muted: ['left'], hidden: ['right'] })
    expect(screen.getByLabelText('Hear Bass')).toBeTruthy()
    expect(screen.getByLabelText('Show Melody')).toBeTruthy()
  })

  it('solos one part alone, and adds to the solo with a modifier', () => {
    const { onView } = setup()
    fireEvent.click(screen.getByLabelText('Solo Melody'))
    expect(onView).toHaveBeenLastCalledWith(expect.objectContaining({ soloed: ['right'] }))

    onView.mockClear()
    fireEvent.click(screen.getByLabelText('Solo Melody'), { shiftKey: true })
    expect(onView).toHaveBeenLastCalledWith(expect.objectContaining({ soloed: ['right'] }))
  })

  it('does not offer solo on a hand, which is not a mixer channel', () => {
    setup()
    expect(screen.queryByLabelText('Solo Left hand')).toBeNull()
  })
})
