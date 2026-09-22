import { ListChecks } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'

import type { Grader } from '../lib/grader'
import { describeSuggestion, type Progress } from '../lib/progress'
import {
  barNames,
  STRICTNESSES,
  troubled,
  WINDOWS,
  type Attempt,
  type Strictness,
  type Tally,
} from '../lib/grading'
import { milliseconds } from '../lib/latency'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Hint } from './ui/tooltip'

/**
 * How the last attempt went, in the terms a next attempt is made in.
 *
 * It says which bars to go back to rather than a mark out of a hundred. A
 * percentage is a verdict, and what somebody practising needs is the two bars
 * that keep falling apart. The touch is reported on its own line, because
 * playing the right notes and playing them at the right weight are different
 * skills and one figure covering both says which of them to work on.
 */

/** How many failing bars are worth naming before the list stops being a list. */
const NAMED_BARS = 8

/** How many bars are worth spelling out one by one under the names. */
const DETAILED_BARS = 4

const STRICTNESS_LABELS: Readonly<Record<Strictness, string>> = {
  gentle: 'Gentle',
  steady: 'Steady',
  strict: 'Strict',
}

export function ReportPanel({
  grader,
  progress,
  score,
  className,
}: {
  readonly grader: Grader
  /** What has been practised before today, where a history is being kept. */
  readonly progress?: Progress
  /** Which piece the history is for. */
  readonly score?: string
  readonly className?: string
}) {
  const state = useSyncExternalStore(grader.subscribe, () => grader.state)
  const attempt = state.attempt

  return (
    <Popover>
      <Hint>
        <PopoverTrigger asChild>
          <Button
            variant={attempt === null ? 'ghost' : 'secondary'}
            size="icon"
            aria-label="How it went"
            className={className}
          >
            <ListChecks />
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent className="w-90" align="end">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-text-strong">How it went</h2>

          <div className="flex flex-col gap-1">
            <p className="text-xs text-text-muted">
              Timing window: {milliseconds(WINDOWS[state.strictness])} either side
            </p>
            <div className="flex gap-1">
              {STRICTNESSES.map((strictness) => (
                <Button
                  key={strictness}
                  size="sm"
                  variant={strictness === state.strictness ? 'selected' : 'ghost'}
                  aria-pressed={strictness === state.strictness}
                  onClick={() => {
                    grader.setStrictness(strictness)
                  }}
                >
                  {STRICTNESS_LABELS[strictness]}
                </Button>
              ))}
            </div>
          </div>

          {attempt === null ? (
            <p className="text-sm text-text-muted" data-testid="no-attempt">
              {state.running
                ? 'Listening. Play along, and this says how it went when the pass ends.'
                : 'Play a passage with the score, and this says how it went.'}
            </p>
          ) : (
            <Report attempt={attempt} />
          )}

          {progress === undefined || score === undefined ? null : (
            <History progress={progress} score={score} />
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Report({ attempt }: { readonly attempt: Attempt }) {
  const { tally } = attempt
  const bars = troubled(attempt.bars)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-default" data-testid="attempt-headline">
        <span className="font-mono tabular-nums">
          {String(tally.correct)} of {String(tally.of)}
        </span>{' '}
        notes in time.
      </p>

      <dl className="flex flex-col gap-1 text-xs">
        <Count label="Early" value={tally.early} />
        <Count label="Late" value={tally.late} />
        <Count label="Wrong note" value={tally.wrong} />
        <Count label="Missed" value={tally.missed} />
        <Count label="Not in the score" value={tally.extra} />
      </dl>

      {bars.length === 0 ? (
        <p className="text-sm text-judge-correct" data-testid="troubled-bars">
          Every bar came out.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-text-default" data-testid="troubled-bars">
            Go back to {bars.length === 1 ? 'bar' : 'bars'}{' '}
            {barNames(bars.slice(0, NAMED_BARS).map((bar) => bar.bar))}.
          </p>
          <ul className="flex flex-col gap-0.5 text-xs text-text-muted">
            {bars.slice(0, DETAILED_BARS).map((bar) => (
              <li key={bar.bar}>
                Bar {bar.bar}: {faultsOf(bar.tally)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {attempt.sections.length === 0 ? null : (
        <dl className="flex flex-col gap-1 text-xs" data-testid="sections">
          {attempt.sections.map((section) => (
            <div key={section.id} className="flex justify-between gap-4">
              <dt className="text-text-muted">{section.label}</dt>
              <dd className="font-mono tabular-nums">
                {String(section.tally.correct)} of {String(section.tally.of)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="text-xs text-text-muted" data-testid="dynamics">
        {attempt.dynamics === null
          ? 'Touch is not graded: this input says nothing about how hard a key was struck.'
          : `Touch: ${String(attempt.dynamics.within)} of ${String(attempt.dynamics.of)} notes at the weight written, typically ${describeTouch(attempt.dynamics.off)}.`}
      </p>
    </div>
  )
}

/**
 * What is still failing, across every attempt at this piece.
 *
 * A sentence naming bars rather than a chart, for the same reason the report
 * above names them: somebody about to practise needs somewhere to start, not
 * a history to interpret. Both buttons are about the piece on screen, which is
 * what this panel is: the doors on the whole history — save it as a file,
 * delete it — are in the footer, beside the settings' own reset.
 */
function History({ progress, score }: { readonly progress: Progress; readonly score: string }) {
  useSyncExternalStore(progress.subscribe, () => progress.records)
  const suggestion = progress.suggest(score)
  const [copied, setCopied] = useState(false)

  if (suggestion === null) {
    return (
      <p className="border-t border-border-subtle pt-3 text-xs text-text-muted">
        Nothing practised yet. Every attempt from here is kept, on this machine and nowhere else.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
      <h3 className="text-xs font-semibold text-text-strong">What keeps failing</h3>
      <p className="text-sm text-text-default" data-testid="history">
        {describeSuggestion(suggestion)}
      </p>
      {suggestion.tempoReached === null ? null : (
        <p className="text-xs text-text-muted" data-testid="tempo-reached">
          Cleanest at {Math.round(suggestion.tempoReached * 100)}% of the written tempo.
        </p>
      )}
      {suggestion.stale ? (
        <p className="text-xs text-text-muted" data-testid="history-stale">
          Some of this was practised against notes that have since changed.
        </p>
      ) : null}
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            // Read out first: `clipboard?.writeText(...)` never evaluates its
            // argument where there is no clipboard, and the read is the thing.
            const text = progress.exported(score)
            void navigator.clipboard?.writeText(text)
            setCopied(true)
          }}
        >
          {copied ? 'Copied' : 'Copy this piece'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            progress.forget(score)
            setCopied(false)
          }}
        >
          Forget this piece
        </Button>
      </div>
    </div>
  )
}

function Count({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-muted">{label}</dt>
      <dd
        className={
          value === 0 ? 'font-mono tabular-nums' : 'font-mono tabular-nums text-judge-late'
        }
        data-testid={`count-${label.toLowerCase().replaceAll(' ', '-')}`}
      >
        {String(value)}
      </dd>
    </div>
  )
}

/** What went wrong in a bar, in the words the counts are named by. */
function faultsOf(tally: Tally): string {
  const parts: string[] = []
  const say = (count: number, what: string) => {
    if (count > 0) {
      parts.push(`${String(count)} ${what}`)
    }
  }
  say(tally.missed, 'missed')
  say(tally.wrong, 'at the wrong pitch')
  say(tally.late, 'late')
  say(tally.early, 'early')
  say(tally.extra, 'not in the score')
  return parts.join(', ')
}

/** Which way the touch leans, said rather than signed. */
function describeTouch(off: number): string {
  const size = Math.abs(Math.round(off))
  if (size === 0) {
    return 'as written'
  }
  return `${String(size)} ${off > 0 ? 'harder' : 'softer'} than written`
}
