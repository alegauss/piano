import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createKeysInput } from '../lib/keys-input'
import { KeysPanel } from './KeysPanel'

async function open() {
  const keys = createKeysInput()
  render(<KeysPanel keys={keys} />)
  fireEvent.click(screen.getByLabelText('Play with the typing keyboard'))
  await screen.findByText('Typing plays', { selector: 'span' })
  return keys
}

describe('KeysPanel', () => {
  it('starts switched off, since the letters are shortcuts until somebody says otherwise', async () => {
    const keys = await open()
    expect(keys.state.playing).toBe(false)
    expect(screen.getByLabelText('Typing plays')).toHaveAttribute('aria-checked', 'false')
  })

  it('switches typing into an instrument and back', async () => {
    const keys = await open()
    fireEvent.click(screen.getByLabelText('Typing plays'))
    expect(keys.state.playing).toBe(true)
    fireEvent.click(screen.getByLabelText('Typing plays'))
    expect(keys.state.playing).toBe(false)
  })

  it('says which two octaves the rows are playing, and moves them', async () => {
    const keys = await open()
    expect(screen.getByTestId('keys-range').textContent).toBe('C3–C5')

    fireEvent.click(screen.getByLabelText('An octave up'))
    expect(keys.state.octave).toBe(1)
    expect(screen.getByTestId('keys-range').textContent).toBe('C4–C6')

    fireEvent.click(screen.getByLabelText('An octave down'))
    fireEvent.click(screen.getByLabelText('An octave down'))
    expect(screen.getByTestId('keys-range').textContent).toBe('C2–C4')
  })

  it('states what this input cannot do rather than leaving it to be discovered', async () => {
    await open()
    expect(screen.getByText(/No velocity/)).toBeTruthy()
    expect(screen.getByText(/Key rollover/)).toBeTruthy()
  })

  it('plays a note from the document once it is on', async () => {
    const keys = await open()
    const heard: number[] = []
    keys.onEvent((event) => {
      if (event.kind === 'on') {
        heard.push(event.pitch)
      }
    })
    fireEvent.click(screen.getByLabelText('Typing plays'))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true }))
    expect(heard).toEqual([48])
  })
})
