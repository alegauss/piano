import { Music4 } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { cn } from '../lib/cn'
import { describeMidi } from '../lib/midi'
import type { MidiInput } from '../lib/midi-input'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Hint } from './ui/tooltip'

/**
 * Which keyboard is connected, and what it is actually sending.
 *
 * The raw event log is the point. An odd controller — one that never sends a
 * note-off, or puts the pedal somewhere unexpected — is diagnosed by looking
 * at its bytes, and without this the only alternative is guessing.
 */

/** How many events the log keeps. Enough to see a chord and a pedal, not a history. */
const KEPT = 12

export function MidiMonitor({
  midi,
  className,
}: {
  readonly midi: MidiInput
  readonly className?: string
}) {
  const state = useSyncExternalStore(midi.subscribe, () => midi.state)
  // Each line carries a number of its own: a log is a stream of lines that
  // look alike, so nothing else about one identifies it.
  const [log, setLog] = useState<readonly { id: number; line: string }[]>([])

  useEffect(() => {
    midi.start()
    let next = 0
    return midi.onEvent((event, raw) => {
      const bytes = raw.map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
      next += 1
      const entry = { id: next, line: `${describeMidi(event)}  ${bytes}` }
      setLog((held) => [entry, ...held].slice(0, KEPT))
    })
  }, [midi])

  const connected = state.devices.some((device) => device.id === state.chosen)

  return (
    <Popover>
      <Hint>
        <PopoverTrigger asChild>
          <Button
            variant={connected ? 'secondary' : 'ghost'}
            size="icon"
            aria-label="MIDI input"
            className={className}
          >
            <Music4 />
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent className="w-80" align="end">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text-strong">MIDI input</h2>
            <p className="text-xs text-text-muted" data-testid="midi-status">
              {status(state.status, state.detail, state.devices.length)}
            </p>
          </div>

          {state.devices.length === 0 ? null : (
            <ul className="flex flex-col gap-1">
              {state.devices.map((device) => (
                <li key={device.id}>
                  <button
                    type="button"
                    onClick={() => {
                      midi.choose(device.id)
                    }}
                    aria-pressed={device.id === state.chosen}
                    className={cn(
                      'w-full rounded-(--radius) px-2 py-1 text-left text-sm',
                      device.id === state.chosen
                        ? 'bg-accent text-accent-contrast'
                        : 'text-text-default hover:bg-surface-overlay',
                    )}
                  >
                    {device.name}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div>
            <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">
              Events
            </h3>
            {log.length === 0 ? (
              <p className="py-1 text-xs text-text-muted">nothing yet — play a key</p>
            ) : (
              <ol data-testid="midi-log" className="flex flex-col font-mono text-xs">
                {log.map((entry) => (
                  <li key={entry.id} className="truncate text-text-default">
                    {entry.line}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function status(kind: string, detail: string, devices: number): string {
  if (kind === 'ready') {
    return devices === 0 ? 'no device connected' : `${String(devices)} connected`
  }
  if (kind === 'starting') {
    return 'looking for a keyboard'
  }
  return detail === '' ? kind : detail
}
