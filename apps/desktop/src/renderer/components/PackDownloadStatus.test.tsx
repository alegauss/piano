import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { megabytes, PackDownloadStatus } from './PackDownloadStatus'

/** What the footer says about the recordings' download, at each point of it. */

describe('the download in the footer', () => {
  it('offers the recordings with their size', () => {
    let started = 0
    render(
      <PackDownloadStatus
        state={{ kind: 'offered', bytes: 15 * 1024 * 1024 }}
        onStart={() => (started += 1)}
        onCancel={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Download the recorded piano (15 MB)' }))
    expect(started).toBe(1)
  })

  it('says how far it has got, and stops when asked', () => {
    let cancelled = 0
    render(
      <PackDownloadStatus
        state={{ kind: 'downloading', bytes: 3 * 1024 * 1024, total: 12 * 1024 * 1024 }}
        onStart={() => {}}
        onCancel={() => (cancelled += 1)}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('25% (3.0 MB of 12 MB)')
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(cancelled).toBe(1)
  })

  it('says why it stopped, and tries again', () => {
    let started = 0
    render(
      <PackDownloadStatus
        state={{ kind: 'stopped', reason: 'the server said 503', bytes: 1 }}
        onStart={() => (started += 1)}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'The download stopped: the server said 503',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(started).toBe(1)
  })

  it('says nothing when there is nothing to download, or it is done', () => {
    const { container } = render(
      <PackDownloadStatus
        state={{ kind: 'unavailable', reason: 'nowhere set' }}
        onStart={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(container).toBeEmptyDOMElement()
    expect(megabytes(512 * 1024)).toBe('0.5 MB')
  })
})
