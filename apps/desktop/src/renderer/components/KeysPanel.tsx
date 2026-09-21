import { pitchToSpelling } from '@piano/score-format'
import { Keyboard } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'

import type { KeysInput } from '../lib/keys-input'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Hint } from './ui/tooltip'
import { Switch } from './ui/switch'

/**
 * Playing with the typing keyboard, and what it cannot do.
 *
 * Switching it on is deliberate, because the letters are transport shortcuts
 * until somebody says they are notes. The panel says where the mapping sits
 * now, since two rows of a keyboard cover two octaves of an eighty-eight key
 * piano and the eye needs telling which two.
 *
 * The two limitations are written here rather than left to be discovered. A
 * typewriter has no velocity, so nothing about dynamics can be graded from
 * it. And key rollover means a typical keyboard drops the third or fourth
 * key of a chord: somebody whose chord came out wrong should learn that from
 * the app rather than conclude their playing is at fault.
 */
export function KeysPanel({
  keys,
  className,
}: {
  readonly keys: KeysInput
  readonly className?: string
}) {
  const state = useSyncExternalStore(keys.subscribe, () => keys.state)

  useEffect(() => keys.attach(), [keys])

  const [low, high] = state.range

  return (
    <Popover>
      <Hint>
        <PopoverTrigger asChild>
          <Button
            variant={state.playing ? 'secondary' : 'ghost'}
            size="icon"
            aria-label="Play with the typing keyboard"
            aria-pressed={state.playing}
            className={className}
          >
            <Keyboard />
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent className="w-80" align="end">
        <div className="flex flex-col gap-3">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-text-strong">Typing plays</span>
            <Switch
              checked={state.playing}
              onCheckedChange={(next) => {
                keys.setPlaying(next)
              }}
              aria-label="Typing plays"
            />
          </label>

          <p className="text-xs text-text-muted">
            The Z row is one octave and the Q row the one above, with the black keys above their
            white ones. While this is on, those letters play instead of running the transport.
          </p>

          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Octave</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="An octave down"
              onClick={() => {
                keys.shiftOctave(-1)
              }}
            >
              <span aria-hidden>&minus;</span>
            </Button>
            <span data-testid="keys-range" className="font-mono text-sm tabular-nums">
              {pitchToSpelling(low)}–{pitchToSpelling(high)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="An octave up"
              onClick={() => {
                keys.shiftOctave(1)
              }}
            >
              <span aria-hidden>+</span>
            </Button>
          </div>

          <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-text-muted">
            <li>
              No velocity: every note is struck at the same force, and dynamics are not graded from
              it.
            </li>
            <li>
              Key rollover: most keyboards drop the third or fourth key of a chord. That is the
              keyboard, not your playing.
            </li>
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  )
}
