import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { OpenReport } from './OpenReport'

/**
 * What a person is told when a file does not open, or opens with guesses.
 * The claims: the words are the validator's needs and fixes, the JSON path is
 * out of the way, and it says the open piece is still open.
 */

const problems = Array.from({ length: 10 }, (_, index) => ({
  kind: 'out of range',
  path: `notes.${String(index)}.pitch`,
  received: '200',
  expected: `a MIDI pitch from 0 to 127 (note ${String(index)})`,
  ...(index === 0 ? { fix: 'lower it by an octave' } : {}),
}))

describe('saying what came of an open', () => {
  it('says why a file was refused, and that the open piece is untouched', () => {
    render(
      <OpenReport
        report={{ kind: 'refused', name: 'broken.json', message: 'for a model', problems }}
        open="Aria"
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Could not open broken.json')).toBeInTheDocument()
    expect(screen.getByText('Nothing changed: Aria is still open.')).toBeInTheDocument()
    expect(screen.getByText('Needs a MIDI pitch from 0 to 127 (note 0).')).toBeInTheDocument()
    expect(screen.getByText('To fix it: lower it by an octave')).toBeInTheDocument()
    expect(screen.getByText('And 2 more problems.')).toBeInTheDocument()
    // The path is there for whoever wants it, behind a disclosure.
    const where = screen.getByText('notes.0.pitch: found 200')
    expect(where.closest('details')).not.toBeNull()
  })

  it('falls back to the message when there is no list to give', () => {
    render(
      <OpenReport
        report={{
          kind: 'refused',
          name: 'notes.json',
          message: 'notes.json is not JSON, so it cannot be a score.',
          problems: [],
        }}
        open="Aria"
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('notes.json is not JSON, so it cannot be a score.')).toBeInTheDocument()
  })

  it('lists what a MIDI import guessed and left out', () => {
    render(
      <OpenReport
        report={{
          kind: 'notices',
          name: 'tune.mid',
          notices: ['Guessed: hands, split at middle C', 'Left out: the drum track'],
        }}
        open="tune"
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Opened tune.mid')).toBeInTheDocument()
    expect(screen.getByText('Left out: the drum track')).toBeInTheDocument()
  })

  it('shows nothing when there is nothing to say', () => {
    render(<OpenReport report={null} open="Aria" onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
