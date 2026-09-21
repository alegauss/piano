import { Timer } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import type { Calibrator, Latency } from '../lib/latency'
import { milliseconds } from '../lib/latency'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

/**
 * What the machine's lag is, and where it came from.
 *
 * Both figures are shown rather than kept out of the way. An absurd input
 * latency almost always means a bad audio driver or a Bluetooth headset, and
 * telling somebody that is more use than quietly grading them late for the
 * rest of the session.
 */
export function LatencyPanel({
  latency,
  calibrator,
  onMeasured,
  setup,
  className,
}: {
  readonly latency: Latency
  readonly calibrator: Calibrator
  /** Called with the measured offset when it is kept. */
  readonly onMeasured: (seconds: number) => void
  /** What this calibration is for: the device and the output it was taken with. */
  readonly setup: string
  readonly className?: string
}) {
  const state = useSyncExternalStore(calibrator.subscribe, () => calibrator.state)
  const measured = latency.input !== 0

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={measured ? 'secondary' : 'ghost'}
          size="icon"
          aria-label="Latency"
          className={className}
        >
          <Timer />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-text-strong">Latency</h2>

          <dl className="flex flex-col gap-1 text-xs">
            <div className="flex justify-between">
              <dt className="text-text-muted">Output, as reported</dt>
              <dd className="font-mono tabular-nums" data-testid="output-latency">
                {milliseconds(latency.output)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Input, measured</dt>
              <dd className="font-mono tabular-nums" data-testid="input-latency">
                {measured ? milliseconds(latency.input) : 'not measured'}
              </dd>
            </div>
          </dl>

          <p className="text-xs text-text-muted">
            Both are subtracted before anything is graded. The input figure is measured for this
            setup only: {setup}.
          </p>

          {state.running ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-text-default" data-testid="calibration-progress">
                Strike a key with each click: {state.taken} of {state.of}
              </p>
              <Button
                variant="ghost"
                onClick={() => {
                  calibrator.stop()
                }}
              >
                Stop
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {state.offset === null ? null : (
                <>
                  <p className="text-sm text-text-default" data-testid="calibration-result">
                    Measured {milliseconds(state.offset)}, give or take{' '}
                    {milliseconds(state.scatter)}, from {String(state.taken)} strikes.
                  </p>
                  {state.suspicious ? (
                    <p className="text-xs text-danger" data-testid="calibration-warning">
                      That is far more than a player&rsquo;s reaction time. It usually means a
                      Bluetooth output or an audio driver adding delay, and it is worth fixing
                      rather than calibrating around.
                    </p>
                  ) : null}
                  <Button
                    variant="primary"
                    onClick={() => {
                      onMeasured(state.offset ?? 0)
                    }}
                  >
                    Use this figure
                  </Button>
                </>
              )}
              <Button
                variant={state.offset === null ? 'primary' : 'ghost'}
                onClick={() => {
                  calibrator.start()
                }}
              >
                {state.offset === null ? 'Calibrate' : 'Measure again'}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
