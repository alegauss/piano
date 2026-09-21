import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SoundStatus } from './SoundStatus'

const credit = {
  title: 'Salamander Grand Piano V3',
  author: 'Alexander Holm',
  licence: 'CC-BY-3.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
  source: 'https://example.com/salamander',
  licenceFile: 'LICENSE.txt',
  notes: 'Four of sixteen layers.',
}

describe('SoundStatus', () => {
  it('says the piano is synthesised, and why, when there is no pack', () => {
    render(<SoundStatus state={{ kind: 'synth', reason: 'no sample pack is installed in /p' }} />)
    expect(screen.getByText(/synthesised piano/)).toHaveTextContent(
      'no sample pack is installed in /p',
    )
  })

  it('counts registers while the pack loads, without blocking anything', () => {
    render(<SoundStatus state={{ kind: 'sampled', credit, loaded: 12, total: 30 }} />)
    expect(screen.getByText(/Salamander Grand Piano V3/)).toHaveTextContent(
      'loading 12 of 30 registers',
    )
  })

  it('drops the count once every register is in', () => {
    render(<SoundStatus state={{ kind: 'sampled', credit, loaded: 30, total: 30 }} />)
    expect(screen.getByText('Sound: Salamander Grand Piano V3')).toBeInTheDocument()
  })

  it('credits the recordings, their author and their licence', () => {
    render(<SoundStatus state={{ kind: 'sampled', credit, loaded: 30, total: 30 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'About the sound' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Recorded by Alexander Holm')
    expect(screen.getByRole('link', { name: 'CC-BY-3.0' })).toHaveAttribute(
      'href',
      credit.licenceUrl,
    )
    expect(dialog).toHaveTextContent('LICENSE.txt')
    expect(dialog).toHaveTextContent('Four of sixteen layers.')
  })

  it('names what went wrong when the pack could not be loaded', () => {
    render(<SoundStatus state={{ kind: 'failed', message: 'the manifest cannot be used' }} />)
    expect(screen.getByText(/could not be loaded/)).toHaveTextContent('the manifest cannot be used')
  })
})
