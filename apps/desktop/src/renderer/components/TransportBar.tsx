import { ticksToSeconds, type ResolvedTiming } from '@piano/score-format'
import {
  Maximize2,
  Minimize2,
  Moon,
  Pause,
  Play,
  Repeat,
  SkipBack,
  Sparkles,
  Sun,
  ZoomIn,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import type { LoopRange, Transport } from '../audio'
import type { KeysInput } from '../lib/keys-input'
import type { Calibrator, Latency } from '../lib/latency'
import type { MidiInput } from '../lib/midi-input'
import { barsBetween } from '../lib/bars'
import { cn } from '../lib/cn'
import { clampLead, MAX_LEAD_SECONDS, MIN_LEAD_SECONDS } from '../lib/roll'
import type { ThemeName } from '../lib/theme'
import { useTransportState, usePosition } from '../lib/useTransport'
import { KeysPanel } from './KeysPanel'
import { LatencyPanel } from './LatencyPanel'
import { MidiMonitor } from './MidiMonitor'
import { Button } from './ui/button'
import { Slider } from './ui/slider'

/**
 * Everything the app is driven from, on one row.
 *
 * Every control shows what the transport says rather than what it was asked
 * for, so a pause that the machine refused does not flip an icon, and the
 * piece ending puts the button back to play with nobody pressing anything.
 *
 * The keyboard is the other half. Someone practising has their hands on a
 * piano, not on a mouse: space starts and stops, the bracket keys change the
 * tempo, L loops and Home goes back to the start. None of those letters is
 * one the typing keyboard plays a note with, so switching that on takes
 * nothing away. Shortcuts stay out of the way of anything being typed into.
 */

/** How much a press of the tempo keys moves the practice tempo. */
const TEMPO_STEP = 0.05
const MIN_TEMPO_SCALE = 0.25
const MAX_TEMPO_SCALE = 2

/** The widest transposition the bar offers, in semitones either way. */
const TRANSPOSE_LIMIT = 12

export type TransportBarProps = {
  readonly transport: Transport
  readonly timing: ResolvedTiming
  /** The last tick of the piece, which is what the scrubber runs to. */
  readonly lastTick: number
  readonly leadSeconds: number
  readonly onLeadSeconds: (seconds: number) => void
  readonly effects: boolean
  readonly onEffects: (on: boolean) => void
  readonly theme: ThemeName
  readonly onTheme: (theme: ThemeName) => void
  readonly full: boolean
  readonly onFull: (full: boolean) => void
  /** The MIDI input, for the monitor that says what a controller is sending. */
  readonly midi?: MidiInput
  /** The typing keyboard as an instrument, for the panel that switches it on. */
  readonly keys?: KeysInput
  /** The machine's measured lag, shown rather than hidden. */
  readonly latency?: Latency
  readonly calibrator?: Calibrator
  readonly onMeasuredLatency?: (seconds: number) => void
  /** What a calibration was taken with: the device and the output. */
  readonly latencySetup?: string
  /** Called before playing, to let the platform's audio start on a gesture. */
  readonly onStart?: () => void
  readonly className?: string
}

/** Minutes and seconds, as a clock shows them. */
export function clockTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  return `${String(minutes)}:${String(whole % 60).padStart(2, '0')}`
}

export function TransportBar({
  transport,
  timing,
  lastTick,
  leadSeconds,
  onLeadSeconds,
  effects,
  onEffects,
  theme,
  onTheme,
  full,
  onFull,
  midi,
  keys,
  latency,
  calibrator,
  onMeasuredLatency,
  latencySetup = 'this setup',
  onStart,
  className,
}: TransportBarProps) {
  const state = useTransportState(transport)
  const position = usePosition(transport)
  /** While a scrub is in hand, what the pointer says, so the clock does not drag it back. */
  const [scrubbing, setScrubbing] = useState<number | null>(null)
  /** The last loop set, so the button can put it back after turning it off. */
  const [lastLoop, setLastLoop] = useState<LoopRange | null>(null)

  const playing = state.status === 'playing'
  const shown = scrubbing ?? position

  function playPause() {
    if (playing) {
      transport.pause()
      return
    }
    onStart?.()
    transport.play()
  }

  function restart() {
    transport.seek(transport.loop?.start ?? 0)
  }

  function nudgeTempo(by: number) {
    transport.setTempoScale(
      Math.min(MAX_TEMPO_SCALE, Math.max(MIN_TEMPO_SCALE, round(transport.tempoScale + by))),
    )
  }

  function toggleLoop() {
    if (state.loop !== null) {
      setLastLoop(state.loop)
      transport.setLoop(null)
      return
    }
    // Nothing chosen yet: the bar the position is in, which is the one
    // somebody pressing loop almost always means.
    transport.setLoop(lastLoop ?? barsBetween(timing, position, position))
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) {
        return
      }
      const handled: Record<string, () => void> = {
        ' ': playPause,
        '[': () => {
          nudgeTempo(-TEMPO_STEP)
        },
        ']': () => {
          nudgeTempo(TEMPO_STEP)
        },
        l: toggleLoop,
        L: toggleLoop,
        // Home rather than R: R is a note on the typing keyboard, and a key
        // that plays F sharp in one mode and jumps to the start in another
        // is worse than a key somebody has to learn once.
        Home: restart,
      }
      const act = handled[event.key]
      if (act !== undefined) {
        event.preventDefault()
        act()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  })

  const seconds = (tick: number) => ticksToSeconds(timing, tick) / state.tempoScale
  const bpm = Math.round(writtenBpm(timing) * state.tempoScale)

  return (
    <section
      aria-label="Transport"
      className={cn(
        'flex flex-col gap-2 border-t border-border-subtle bg-surface-raised px-4 py-3',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="ghost" size="icon" onClick={restart} aria-label="Back to the start (Home)">
          <SkipBack />
        </Button>
        <Button
          variant="primary"
          size="icon"
          onClick={playPause}
          aria-label={playing ? 'Pause (space)' : 'Play (space)'}
          aria-pressed={playing}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <Button
          variant={state.loop === null ? 'ghost' : 'secondary'}
          size="icon"
          onClick={toggleLoop}
          aria-label="Loop (L)"
          aria-pressed={state.loop !== null}
        >
          <Repeat />
        </Button>

        <p className="font-mono text-sm text-text-muted tabular-nums" data-testid="elapsed">
          {clockTime(seconds(shown))} / {clockTime(seconds(lastTick))}
        </p>

        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2">
          <Stepper
            label="Tempo"
            value={`${String(bpm)} bpm`}
            onDown={() => {
              nudgeTempo(-TEMPO_STEP)
            }}
            onUp={() => {
              nudgeTempo(TEMPO_STEP)
            }}
            downLabel="Slower ([)"
            upLabel="Faster (])"
          />
          <Stepper
            label="Transpose"
            value={`${state.transpose > 0 ? '+' : ''}${String(state.transpose)}`}
            onDown={() => {
              transport.setTranspose(Math.max(-TRANSPOSE_LIMIT, state.transpose - 1))
            }}
            onUp={() => {
              transport.setTranspose(Math.min(TRANSPOSE_LIMIT, state.transpose + 1))
            }}
            downLabel="Down a semitone"
            upLabel="Up a semitone"
          />

          <label className="flex items-center gap-2 text-xs text-text-muted">
            <ZoomIn className="size-4" aria-hidden />
            <Slider
              aria-label="Seconds of music on screen"
              className="w-24"
              min={MIN_LEAD_SECONDS}
              max={MAX_LEAD_SECONDS}
              step={0.5}
              value={[leadSeconds]}
              onValueChange={([next]) => {
                onLeadSeconds(clampLead(next ?? leadSeconds))
              }}
            />
          </label>

          {latency === undefined || calibrator === undefined ? null : (
            <LatencyPanel
              latency={latency}
              calibrator={calibrator}
              onMeasured={onMeasuredLatency ?? (() => {})}
              setup={latencySetup}
            />
          )}
          {keys === undefined ? null : <KeysPanel keys={keys} />}
          {midi === undefined ? null : <MidiMonitor midi={midi} />}
          <Button
            variant={effects ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => {
              onEffects(!effects)
            }}
            aria-label="Effects"
            aria-pressed={effects}
          >
            <Sparkles />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              onTheme(theme === 'dark' ? 'light' : 'dark')
            }}
            aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              onFull(!full)
            }}
            aria-label={full ? 'Leave full screen' : 'Full screen'}
            aria-pressed={full}
          >
            {full ? <Minimize2 /> : <Maximize2 />}
          </Button>
        </div>
      </div>

      <Slider
        aria-label="Position in the piece"
        min={0}
        max={Math.max(1, lastTick)}
        step={1}
        value={[Math.min(shown, Math.max(1, lastTick))]}
        onValueChange={([next]) => {
          setScrubbing(next ?? 0)
        }}
        onValueCommit={([next]) => {
          setScrubbing(null)
          transport.seek(next ?? 0)
        }}
      />
    </section>
  )
}

function Stepper({
  label,
  value,
  onDown,
  onUp,
  downLabel,
  upLabel,
}: {
  readonly label: string
  readonly value: string
  readonly onDown: () => void
  readonly onUp: () => void
  readonly downLabel: string
  readonly upLabel: string
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-text-muted">{label}</span>
      <Button variant="ghost" size="icon" onClick={onDown} aria-label={downLabel}>
        <span aria-hidden>&minus;</span>
      </Button>
      <span className="min-w-14 text-center font-mono text-sm tabular-nums" data-testid={label}>
        {value}
      </span>
      <Button variant="ghost" size="icon" onClick={onUp} aria-label={upLabel}>
        <span aria-hidden>+</span>
      </Button>
    </div>
  )
}

/** A shortcut must not swallow a keystroke meant for a field. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

/** Past a float's idea of 0.8500000000000001. */
function round(scale: number): number {
  return Math.round(scale * 100) / 100
}

function writtenBpm(timing: ResolvedTiming): number {
  const [first] = timing.tempo
  return 60_000_000 / (first?.microsecondsPerQuarter ?? 500_000)
}
