import type { HistorySaveResult } from '@piano/ipc'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HistoryStatus } from './HistoryStatus'

/** The two doors on the practice history, and what the footer says about it. */

function setup(
  save: () => Promise<HistorySaveResult> = () =>
    Promise.resolve({ kind: 'saved', name: 'piano-practice-2026-01-09.json' }),
) {
  const done = { saved: 0, deleted: 0, dismissed: 0 }
  render(
    <HistoryStatus
      notice={null}
      onDismiss={() => {
        done.dismissed += 1
      }}
      onSave={() => {
        done.saved += 1
        return save()
      }}
      onDelete={() => {
        done.deleted += 1
        return Promise.resolve()
      }}
    />,
  )
  return done
}

describe('the practice history in the footer', () => {
  it('says what could not be read, until it has been read', () => {
    let dismissed = 0
    render(
      <HistoryStatus
        notice="1 attempt could not be read and was left out."
        onDismiss={() => (dismissed += 1)}
        onSave={() => Promise.resolve({ kind: 'cancelled' })}
        onDelete={() => Promise.resolve()}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('1 attempt could not be read')
    fireEvent.click(screen.getByRole('button', { name: 'Understood' }))
    expect(dismissed).toBe(1)
  })

  it('saves a copy and names the file it went to', async () => {
    const done = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Save practice history' }))
    expect(done.saved).toBe(1)
    expect(await screen.findByText('Saved as piano-practice-2026-01-09.json.')).toBeInTheDocument()
  })

  it('says why a copy was not saved, rather than looking as though it was', async () => {
    setup(() => Promise.resolve({ kind: 'refused', message: 'the disk is full' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save practice history' }))
    expect(await screen.findByText(/the disk is full/)).toBeInTheDocument()
  })

  it('says nothing when the save dialog is closed', async () => {
    setup(() => Promise.resolve({ kind: 'cancelled' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save practice history' }))
    await Promise.resolve()
    expect(screen.queryByText(/Saved as/)).not.toBeInTheDocument()
  })

  it('deletes only after asking', async () => {
    const done = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Delete practice history' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Keep it' }))
    expect(done.deleted).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Delete practice history' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(done.deleted).toBe(1)
  })
})
