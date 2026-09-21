import type { Level } from '@piano/score-format'
import { GraduationCap } from 'lucide-react'

import {
  describeHands,
  LEVEL_ORDER,
  LEVEL_PRESETS,
  moved,
  settingsFor,
  type LevelSettings,
} from '../lib/levels'
import { milliseconds } from '../lib/latency'
import { WINDOWS } from '../lib/grading'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Hint } from './ui/tooltip'

/**
 * Choosing a level, and seeing what it means.
 *
 * The panel is mostly the table: three words nobody can act on become a
 * tempo, a hand, a window and a promise about waiting. A knob the session has
 * moved since is marked rather than put back, because the preset is where to
 * start and not what the app insists on.
 */
export function LevelPanel({
  level,
  settings,
  onLevel,
  /** The tempo the score's own arrangement for a level asks for, where it carries one. */
  arrangementTempo,
  source,
  onKeep,
  className,
}: {
  readonly level: Level | null
  /**
   * Where the knobs stand now, read as the panel draws. A function because
   * the tempo and the window live in the transport and the grader, and
   * subscribing the whole bar to both to mark one word is not worth it.
   */
  readonly settings: () => LevelSettings
  readonly onLevel: (level: Level) => void
  readonly arrangementTempo?: (level: Level) => number | null
  /** Where the piece at this level came from: the score's own version, or the rules. */
  readonly source?: string
  /**
   * Keep the version the rules worked out in the score file, where it can be
   * read and corrected. Absent where there is nothing worked out to keep.
   */
  readonly onKeep?: () => void
  readonly className?: string
}) {
  const preset = level === null ? null : LEVEL_PRESETS[level]
  const under =
    preset === null
      ? null
      : settingsFor(preset, { tempoScale: arrangementTempo?.(preset.level) ?? undefined })
  const since = under === null ? [] : moved(under, settings())

  return (
    <Popover>
      <Hint>
        <PopoverTrigger asChild>
          <Button
            variant={level === null ? 'ghost' : 'secondary'}
            size="icon"
            aria-label="Level"
            className={className}
          >
            <GraduationCap />
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent className="w-90" align="end">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-text-strong">Level</h2>

          <div className="flex gap-1">
            {LEVEL_ORDER.map((one) => (
              <Button
                key={one}
                size="sm"
                variant={one === level ? 'secondary' : 'ghost'}
                aria-pressed={one === level}
                onClick={() => {
                  onLevel(one)
                }}
              >
                {LEVEL_PRESETS[one].label}
              </Button>
            ))}
          </div>

          {preset === null || under === null ? (
            <p className="text-sm text-text-muted" data-testid="no-level">
              No level chosen: the score plays as written.
            </p>
          ) : (
            <>
              <p className="text-sm text-text-default" data-testid="level-means">
                {preset.means}
              </p>

              {source === undefined ? null : (
                <p className="text-xs text-text-muted" data-testid="level-source">
                  {source}
                </p>
              )}
              {onKeep === undefined ? null : (
                <Button variant="outline" size="sm" className="self-start" onClick={onKeep}>
                  Keep this version in the score
                </Button>
              )}

              <dl className="flex flex-col gap-1 text-xs">
                <Knob
                  name="Tempo"
                  value={`${String(Math.round(under.tempoScale * 100))}% of written`}
                  moved={since.includes('tempoScale')}
                />
                <Knob
                  name="Hands you play"
                  value={describeHands(under.plays)}
                  moved={since.includes('plays')}
                />
                <Knob
                  name="Waits for you"
                  value={under.waiting ? 'yes' : 'no'}
                  moved={since.includes('waiting')}
                />
                <Knob
                  name="Timing window"
                  value={milliseconds(WINDOWS[under.strictness])}
                  moved={since.includes('strictness')}
                />
              </dl>

              <dl className="flex flex-col gap-1 text-xs" data-testid="reduction">
                <Knob
                  name="Voices kept"
                  value={preset.reduction.voices === null ? 'all' : String(preset.reduction.voices)}
                />
                <Knob name="Ornaments" value={preset.reduction.ornaments ? 'kept' : 'dropped'} />
                <Knob name="Chords" value={preset.reduction.chords} />
              </dl>

              <p className="text-xs text-text-muted">
                The last three describe the simpler version of a piece, and apply where a score
                carries an arrangement for this level. Everything above stays adjustable: a level is
                where to start, not what the app insists on.
              </p>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Knob({
  name,
  value,
  moved = false,
}: {
  readonly name: string
  readonly value: string
  readonly moved?: boolean
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-muted">{name}</dt>
      <dd
        className="font-mono tabular-nums"
        data-testid={`knob-${name.toLowerCase().replaceAll(' ', '-')}`}
      >
        {value}
        {moved ? <span className="ml-2 font-sans text-text-muted">moved</span> : null}
      </dd>
    </div>
  )
}
