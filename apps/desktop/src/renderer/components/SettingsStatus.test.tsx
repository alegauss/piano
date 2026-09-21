import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SettingsStatus } from './SettingsStatus'

/** What the footer says about the settings, and the way back to every default. */

describe('the settings in the footer', () => {
  it('says which settings went back to their defaults, until it has been read', () => {
    let dismissed = 0
    render(
      <SettingsStatus
        notice="The theme could not be read, so it is back at the default."
        onDismiss={() => (dismissed += 1)}
        onReset={() => Promise.resolve()}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('The theme could not be read')
    fireEvent.click(screen.getByRole('button', { name: 'Understood' }))
    expect(dismissed).toBe(1)
  })

  it('resets only after asking', async () => {
    let reset = 0
    render(
      <SettingsStatus
        notice={null}
        onDismiss={() => {}}
        onReset={() => {
          reset += 1
          return Promise.resolve()
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reset settings' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Keep them' }))
    expect(reset).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Reset settings' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reset' }))
    expect(reset).toBe(1)
  })
})
