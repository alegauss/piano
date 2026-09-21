import type { Note, ResolvedTiming } from '@piano/score-format'
import { useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '../lib/cn'
import { FrameTimes } from '../lib/frame-timing'
import { clampLead, DEFAULT_LEAD_SECONDS, prepareRoll, soundingPitches } from '../lib/roll'
import { drawRoll } from '../lib/roll-draw'
import { useCanvasPalette } from '../lib/useCanvasPalette'
import { PianoKeyboard, type KeyState } from './PianoKeyboard'

/**
 * Notes falling onto the keyboard, drawn from the audio clock.
 *
 * Every frame asks where playback is and draws from that, rather than moving
 * the notes on by however long the last frame took. The difference shows up
 * as drift: a frame counter that loses a few milliseconds an hour is fine for
 * an animation and useless for a roll, which has to agree with the sound all
 * the way through a piece. A dropped frame here costs one frame, not a
 * permanent offset.
 *
 * The position is a function rather than a prop because it changes 60 times a
 * second and nothing above needs to re-render for it. React draws the field
 * once; the clock drives what is in it.
 *
 * Inside the loop, nothing is asked that could be remembered instead. The
 * element's size comes from a ResizeObserver rather than from measuring it
 * every frame, which would have the roll reading layout sixty times a
 * second; the score is sorted once so its visible notes are found by binary
 * search; and the theme is resolved once per theme rather than per frame.
 */

export type PianoRollProps = {
  readonly timing: ResolvedTiming
  /** The resolved arrangement: difficulty and muted parts are already applied. */
  readonly notes: readonly Note[]
  /** Where playback is, in ticks, read once a frame. */
  readonly position?: () => number
  /** The practice tempo, as a multiple of the written one. */
  readonly tempoScale?: () => number
  /** Seconds of warning: more for a beginner, less for someone reading ahead. */
  readonly leadSeconds?: number
  /** The frame-time overlay: on in development, and forced either way by a test. */
  readonly meter?: boolean
  readonly className?: string
}

/**
 * Beyond two device pixels to the CSS pixel there is nothing more to see in a
 * field of flat rectangles, and the fill cost keeps climbing.
 */
const MAX_PIXEL_RATIO = 2

/** How often the overlay is allowed to re-render, in milliseconds. */
const METER_INTERVAL_MS = 500

export function PianoRoll({
  timing,
  notes,
  position = () => 0,
  tempoScale = () => 1,
  leadSeconds = DEFAULT_LEAD_SECONDS,
  meter = import.meta.env.DEV,
  className,
}: PianoRollProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const palette = useCanvasPalette()
  const [sounding, setSounding] = useState<ReadonlyMap<number, KeyState>>(new Map())
  const [frameTime, setFrameTime] = useState<{ worst: number; typical: number } | null>(null)
  // Sorted once per score rather than per frame.
  const score = useMemo(() => prepareRoll(notes), [notes])

  // The draw loop reads these through a ref so that changing the lead or the
  // score does not tear down and rebuild the loop mid-flight. Kept current
  // after each render rather than during it, which is not a ref's moment.
  const frame = useRef({ timing, score, position, tempoScale, leadSeconds, palette })
  useEffect(() => {
    frame.current = { timing, score, position, tempoScale, leadSeconds, palette }
  })

  useEffect(() => {
    const element = canvas.current
    if (element === null) {
      return
    }
    const context = element.getContext('2d')
    if (context === null) {
      return
    }

    let running = true
    let shown: readonly number[] = []
    let size = element.getBoundingClientRect()
    const times = new FrameTimes()
    let reported = 0

    // The one place the element's size is read. The loop uses whatever this
    // last saw, so drawing never touches layout.
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        size = entry.contentRect
      }
    })
    observer.observe(element)

    const draw = (now: number) => {
      if (!running) {
        return
      }
      requestAnimationFrame(draw)
      if (size.width === 0 || size.height === 0) {
        return
      }
      const started = performance.now()
      const current = frame.current
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
      const width = Math.round(size.width * ratio)
      const height = Math.round(size.height * ratio)
      if (element.width !== width || element.height !== height) {
        element.width = width
        element.height = height
      }
      context.setTransform(width / size.width, 0, 0, height / size.height, 0, 0)

      const view = {
        timing: current.timing,
        position: current.position(),
        leadSeconds: clampLead(current.leadSeconds),
        tempoScale: current.tempoScale(),
        width: size.width,
        height: size.height,
      }
      drawRoll(context, view, current.score, current.palette)

      const pitches = soundingPitches(current.score, view.position)
      // Only when the chord changes: 88 keys re-rendering every frame buys
      // nothing, since a key is struck a few times a second at most.
      if (pitches.length !== shown.length || pitches.some((p, i) => p !== shown[i])) {
        shown = pitches
        setSounding(new Map<number, KeyState>(pitches.map((pitch) => [pitch, 'sounding'])))
      }

      times.record(performance.now() - started)
      // An overlay that re-renders every frame measures itself as much as the
      // roll, so it is allowed to say something twice a second.
      if (meter && now - reported > METER_INTERVAL_MS) {
        reported = now
        setFrameTime({ worst: times.worst, typical: times.percentile(0.5) })
      }
    }
    requestAnimationFrame(draw)

    return () => {
      running = false
      observer.disconnect()
    }
  }, [meter])

  return (
    <div className={cn('relative flex w-full flex-col', className)}>
      <canvas
        ref={canvas}
        role="img"
        aria-label="Falling notes"
        /* min-h-0 or the canvas insists on its own 2:1 intrinsic size and
           squeezes the keyboard out of the column. */
        className="min-h-0 w-full flex-1 rounded-t-(--radius)"
      />
      {frameTime === null ? null : (
        <p
          data-testid="frame-meter"
          className="absolute top-2 right-3 rounded-(--radius) bg-surface-overlay px-2 py-1 font-mono text-xs text-text-muted"
        >
          {frameTime.typical.toFixed(1)} ms · worst {frameTime.worst.toFixed(1)} ms
        </p>
      )}
      <PianoKeyboard states={sounding} className="shrink-0" />
    </div>
  )
}
