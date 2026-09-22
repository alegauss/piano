import type { Hand, Part } from '@piano/score-format'
import { act, fireEvent, render, screen } from '@testing-library/react'
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

  it.each([['Silence Bass'], ['Solo Bass'], ['Hide Bass']])(
    'says on focus that a row’s button will %s',
    async (label) => {
      setup()
      expect(screen.queryByRole('tooltip')).toBeNull()

      // Focus rather than hover: it is the half a keyboard reader needs, and
      // it is the half jsdom can drive without a pointer.
      act(() => {
        screen.getByLabelText(label).focus()
      })
      const tip = await screen.findByRole('tooltip')
      // The button's own name, which already says which part it is about.
      expect(tip.textContent).toBe(label)
    },
  )

  it('leaves a row’s button clickable underneath its hint', async () => {
    const { onView } = setup()
    const button = screen.getByLabelText('Hide Bass')
    act(() => {
      button.focus()
    })
    await screen.findByRole('tooltip')

    // A trigger placed around the button rather than onto it would take this.
    fireEvent.click(button)
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ hidden: ['left'] }))
  })
})
