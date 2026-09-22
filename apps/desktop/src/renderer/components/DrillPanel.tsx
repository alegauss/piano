import type { Hand, Section } from '@piano/score-format'
import { Dumbbell } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'

import type { Drill, DrillRequest } from '../lib/drill'
import { DEFAULT_STEP, MIN_TEMPO_SCALE } from '../lib/drill'
import { describeHands } from '../lib/levels'
import { HANDS, type OtherHand } from '../lib/parts'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Hint } from './ui/tooltip'
import { Switch } from './ui/switch'

/**
 * Setting up the drill, in the terms somebody says it in: this passage, this
 * hand, starting here and climbing.
 *
 * The passage is whatever is already marked — the loop on the roll or a named
 * section — because dragging a loop and then naming it again would be the
 * same passage twice. What the panel adds is the ladder and the hands, and
 * then it gets out of the way: while a drill runs the only thing worth
 * showing is which repetition this is and where the tempo got to.
 */

/** The rungs the ladder is offered in, as fractions of the written tempo. */
const STARTS = [0.5, 0.6, 0.75, 0.9] as const

export function DrillPanel({
  drill,
  sections = [],
  /** The stretch marked on the roll, which is what a drill repeats by default. */
  loop,
  /** The bar playback is standing in, for a drill nobody has marked a stretch for. */
  currentBars,
  className,
}: {
  readonly drill: Drill
  readonly sections?: readonly Section[]
  readonly loop?: { readonly start: number; readonly end: number } | null
  readonly currentBars?: () => { readonly start: number; readonly end: number }
  readonly className?: string
}) {
  const state = useSyncExternalStore(drill.subscribe, () => drill.state)
  const [plays, setPlays] = useState<readonly Hand[]>(HANDS)
  const [other, setOther] = useState<OtherHand>('accompanies')
  const [from, setFrom] = useState<number>(0.6)
  const [countIn, setCountIn] = useState(false)
  const [section, setSection] = useState<string | null>(null)

  const range = (): DrillRequest['range'] => {
    if (section !== null) {
      return { kind: 'section', id: section }
    }
    const marked = loop ?? currentBars?.() ?? null
    return marked === null
      ? { kind: 'bars', from: 1, to: 2 }
      : { kind: 'ticks', start: marked.start, end: marked.end }
  }

  return (
    <Popover>
      <Hint>
        <PopoverTrigger asChild>
          <Button
            variant={state.running ? 'selected' : 'ghost'}
            size="icon"
            aria-label="Practice"
            aria-pressed={state.running}
            className={className}
          >
            <Dumbbell />
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent className="w-90" align="end">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-text-strong">Practice</h2>

          {state.running ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-text-default" data-testid="drill-progress">
                Repetition {state.passes + 1} · {state.clean} clean ·{' '}
                {Math.round(state.tempoScale * 100)}% of written
              </p>
              <p className="text-xs text-text-muted" data-testid="drill-last">
                {state.last === 'clean'
                  ? 'That one was clean, so this one is a step faster.'
                  : state.last === 'faulty'
                    ? 'That one had something wrong, so this one drops back a step.'
                    : 'Playing the passage through; it climbs when a repetition comes out clean.'}
              </p>
              <p className="text-xs text-text-muted">
                {describeHands(state.hands)} hand{state.hands.length === 1 ? '' : 's'}, over the
                marked passage.
              </p>
              <Button
                variant="ghost"
                onClick={() => {
                  drill.stop()
                }}
              >
                Stop
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Choice
                label="Hands you take"
                options={[
                  { value: 'both', label: 'Both' },
                  { value: 'left', label: 'Left' },
                  { value: 'right', label: 'Right' },
                ]}
                value={plays.length === HANDS.length ? 'both' : (plays[0] ?? 'both')}
                onValue={(value) => {
                  setPlays(value === 'both' ? HANDS : [value as Hand])
                }}
              />

              <label className="flex items-center justify-between gap-4 text-xs text-text-muted">
                <span>The other hand plays along</span>
                <Switch
                  checked={other === 'accompanies'}
                  onCheckedChange={(on) => {
                    setOther(on ? 'accompanies' : 'silent')
                  }}
                  aria-label="The other hand plays along"
                />
              </label>

              <Choice
                label="Starting tempo"
                options={STARTS.map((start) => ({
                  value: String(start),
                  label: `${String(Math.round(start * 100))}%`,
                }))}
                value={String(from)}
                onValue={(value) => {
                  setFrom(Math.max(MIN_TEMPO_SCALE, Number(value)))
                }}
              />

              {sections.length === 0 ? null : (
                <Choice
                  label="Passage"
                  options={[
                    { value: 'marked', label: 'Marked' },
                    ...sections.map((one) => ({ value: one.id, label: one.label })),
                  ]}
                  value={section ?? 'marked'}
                  onValue={(value) => {
                    setSection(value === 'marked' ? null : value)
                  }}
                />
              )}

              <label className="flex items-center justify-between gap-4 text-xs text-text-muted">
                <span>Count in each repetition</span>
                <Switch
                  checked={countIn}
                  onCheckedChange={setCountIn}
                  aria-label="Count in each repetition"
                />
              </label>

              <p className="text-xs text-text-muted">
                Each repetition is graded. A clean one climbs by {Math.round(DEFAULT_STEP * 100)}%,
                and one with a wrong or missed note drops back by the same.
              </p>

              <Button
                variant="primary"
                onClick={() => {
                  drill.start({ range: range(), hands: plays, other, from, countIn })
                }}
              >
                Start
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Choice({
  label,
  options,
  value,
  onValue,
}: {
  readonly label: string
  readonly options: readonly { readonly value: string; readonly label: string }[]
  readonly value: string
  readonly onValue: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-text-muted">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={option.value === value ? 'selected' : 'ghost'}
            aria-pressed={option.value === value}
            onClick={() => {
              onValue(option.value)
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
