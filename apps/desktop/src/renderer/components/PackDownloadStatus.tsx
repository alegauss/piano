import type { DownloadState } from '../lib/pack-download'
import { Button } from './ui/button'

/**
 * The recordings' download, in the footer beside what is sounding.
 *
 * Offered with its size, followed as it runs, stoppable, and tried again from
 * where it stopped; never a dialog, because the piano plays synthesised the
 * whole time and nobody has to wait for this to do anything.
 */

/** A size as somebody deciding whether to download it reads one. */
export function megabytes(bytes: number): string {
  const size = bytes / (1024 * 1024)
  return `${size < 10 ? size.toFixed(1) : String(Math.round(size))} MB`
}

const small = 'h-5 px-1.5 text-xs'

export function PackDownloadStatus({
  state,
  onStart,
  onCancel,
}: {
  readonly state: DownloadState
  readonly onStart: () => void
  readonly onCancel: () => void
}) {
  switch (state.kind) {
    case 'unknown':
    case 'unavailable':
    case 'installed':
      return null
    case 'offered':
      return (
        <Button variant="ghost" size="sm" className={small} onClick={onStart}>
          Download the recorded piano ({megabytes(state.bytes)})
        </Button>
      )
    case 'downloading': {
      const share = state.total === 0 ? 0 : Math.floor((state.bytes / state.total) * 100)
      return (
        <span className="inline-flex items-center gap-2" role="status">
          Downloading the recorded piano: {String(share)}% ({megabytes(state.bytes)} of{' '}
          {megabytes(state.total)})
          <Button variant="ghost" size="sm" className={small} onClick={onCancel}>
            Stop
          </Button>
        </span>
      )
    }
    case 'installing':
      return <span role="status">Putting the recordings in place…</span>
    case 'stopped':
      return (
        <span className="inline-flex items-center gap-2" role="status">
          The download stopped: {state.reason}
          <Button variant="ghost" size="sm" className={small} onClick={onStart}>
            Try again
          </Button>
        </span>
      )
  }
}
