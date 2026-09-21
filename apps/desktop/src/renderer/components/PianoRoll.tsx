import type { Note, ResolvedTiming } from '@piano/score-format'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import type { LoopRange, StrikeSource } from '../audio'
import { barsBetween } from '../lib/bars'
import { cn } from '../lib/cn'
import { MARK_SECONDS, noteLook, type Feedback, type StrikeVerdict } from '../lib/grading'
import { LabelCache } from '../lib/label-cache'
import { FrameTimes } from '../lib/frame-timing'
import {
  clampLead,
  DEFAULT_LEAD_SECONDS,
  prepareRoll,
  soundingPitches,
  tickAtY,
  type RollView,
} from '../lib/roll'
import { drawRoll } from '../lib/roll-draw'
import { StrikeField } from '../lib/strikes'
import type { CanvasToken } from '../lib/theme'
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
  /**
   * Strikes as the scheduler hands them over, so the burst fires with the
   * sound. Without one the roll draws the music and nothing strikes.
   */
  readonly strikes?: StrikeSource
  /** The burst and the flash at the moment of contact. Off draws and costs nothing. */
  readonly effects?: boolean
  /**
   * The colour each part is drawn in. Given from outside so that hiding a
   * part does not recolour the ones still on the field.
   */
  readonly colours?: ReadonlyMap<string, CanvasToken>
  /**
   * Keys the player owes now, lit while wait mode holds the score. Read once
   * a frame like the position, since it changes as notes are played.
   */
  readonly expected?: () => readonly number[]
  /**
   * What the player has made of the notes so far, read once a frame like the
   * position. Without it the roll draws the music and judges nothing.
   */
  readonly feedback?: () => Feedback | null
  /** The stretch marked for repeat, drawn behind the notes. */
  readonly loop?: LoopRange | null
  /**
   * Called with the bars a drag across the field covered, or null for a
   * click, which clears the loop. Without it the roll is not draggable.
   */
  readonly onSelectLoop?: (range: LoopRange | null) => void
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

/** Ticks of movement below which a drag was really a click. */
const WOBBLE_TICKS = 24

/**
 * What a key shows for each verdict. Early and late are one state, as they
 * are one colour on the roll; a note nobody asked for is wrong on the key
 * that played it, whatever the score was owed elsewhere.
 */
const KEY_STATES: Readonly<Record<StrikeVerdict['outcome'], KeyState>> = {
  correct: 'correct',
  early: 'late',
  late: 'late',
  wrong: 'wrong',
  extra: 'wrong',
}

export function PianoRoll({
  timing,
  notes,
  position = () => 0,
  tempoScale = () => 1,
  leadSeconds = DEFAULT_LEAD_SECONDS,
  strikes,
  effects = true,
  expected = () => [],
  feedback = () => null,
  colours,
  loop = null,
  onSelectLoop,
  meter = import.meta.env.DEV,
  className,
}: PianoRollProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const palette = useCanvasPalette()
  const [sounding, setSounding] = useState<ReadonlyMap<number, KeyState>>(new Map())
  const [frameTime, setFrameTime] = useState<{ worst: number; typical: number } | null>(null)
  // Sorted once per score rather than per frame.
  const score = useMemo(() => prepareRoll(notes, colours), [notes, colours])
  // Bar numbers are rendered once each and blitted after that.
  const labels = useRef(new LabelCache())
  /**
   * The drag in progress and the view it is being read against. Both live in
   * refs: a drag redraws on the next frame anyway, and re-rendering React on
   * every pointer move to move a band would be the expensive way to do it.
   */
  const drag = useRef<{ from: number; to: number; moved: boolean } | null>(null)
  const lastView = useRef<RollView | null>(null)

  // The draw loop reads these through a ref so that changing the lead or the
  // score does not tear down and rebuild the loop mid-flight. Kept current
  // after each render rather than during it, which is not a ref's moment.
  const frame = useRef({
    timing,
    score,
    position,
    tempoScale,
    leadSeconds,
    palette,
    loop,
    expected,
    feedback,
  })
  useEffect(() => {
    frame.current = {
      timing,
      score,
      position,
      tempoScale,
      leadSeconds,
      palette,
      loop,
      expected,
      feedback,
    }
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
    /** What the keyboard was last told, as one string to compare cheaply. */
    let shown = ''
    // Off is off: no field, no subscription, nothing asked of the clock.
    // Drawing invisible particles is not the same as not drawing them.
    const field = effects && strikes !== undefined ? new StrikeField() : null
    const unsubscribe =
      field === null
        ? null
        : strikes?.subscribe((strike) => {
            field.take(strike)
          })
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
      lastView.current = view
      const selecting = drag.current
      const judgement = current.feedback()
      const clock = strikes?.now() ?? null
      drawRoll(context, view, current.score, current.palette, {
        loop: current.loop,
        selecting:
          selecting === null || !selecting.moved
            ? null
            : barsBetween(current.timing, selecting.from, selecting.to),
        labels: labels.current,
        judged: judgement === null ? undefined : (note) => noteLook(judgement, note, view),
        ...(judgement === null || clock === null
          ? {}
          : { timings: { marks: judgement.timings, now: clock, window: judgement.window } }),
      })
      if (field !== null && strikes !== undefined) {
        const audioNow = strikes.now()
        field.update(audioNow, view.width, view.height)
        field.draw(context, audioNow, view, current.palette)
      }

      // What the keyboard shows, in the order each beats the one before: what
      // the app is sounding, what the player owes, and what became of the key
      // they have just struck, which is the freshest thing on the keyboard.
      const states = new Map<number, KeyState>(
        soundingPitches(current.score, view.position).map((pitch) => [pitch, 'sounding']),
      )
      for (const pitch of current.expected()) {
        states.set(pitch, 'expected')
      }
      if (judgement !== null && clock !== null) {
        for (const [pitch, mark] of judgement.keys) {
          if (clock - mark.at <= MARK_SECONDS) {
            states.set(pitch, KEY_STATES[mark.outcome])
          }
        }
      }
      // Only when it changes: 88 keys re-rendering every frame buys nothing,
      // since a key is struck a few times a second at most.
      const signature = [...states].map(([pitch, state]) => `${String(pitch)}${state}`).join(' ')
      if (signature !== shown) {
        shown = signature
        setSounding(states)
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
      unsubscribe?.()
    }
  }, [meter, effects, strikes])

  /** Where a pointer landed on the field, in ticks. */
  function tickUnder(event: { clientY: number }): number | null {
    const element = canvas.current
    const view = lastView.current
    if (element === null || view === null) {
      return null
    }
    return tickAtY(view, event.clientY - element.getBoundingClientRect().top)
  }

  const dragging =
    onSelectLoop === undefined
      ? {}
      : {
          onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => {
            const tick = tickUnder(event)
            if (tick === null) {
              return
            }
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { from: tick, to: tick, moved: false }
          },
          onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => {
            const current = drag.current
            const tick = current === null ? null : tickUnder(event)
            if (current === null || tick === null) {
              return
            }
            // A few pixels of wobble is a click, not a drag across bars.
            drag.current = {
              ...current,
              to: tick,
              moved: current.moved || Math.abs(tick - current.from) > WOBBLE_TICKS,
            }
          },
          onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => {
            const current = drag.current
            drag.current = null
            event.currentTarget.releasePointerCapture(event.pointerId)
            if (current === null) {
              return
            }
            onSelectLoop(current.moved ? barsBetween(timing, current.from, current.to) : null)
          },
          onPointerCancel: () => {
            drag.current = null
          },
        }

  return (
    <div className={cn('relative flex w-full flex-col', className)}>
      <canvas
        ref={canvas}
        role="img"
        aria-label="Falling notes"
        {...dragging}
        /* min-h-0 or the canvas insists on its own 2:1 intrinsic size and
           squeezes the keyboard out of the column. */
        className={cn(
          'min-h-0 w-full flex-1 rounded-t-(--radius)',
          // The browser must not take the drag for a scroll or a selection.
          onSelectLoop === undefined ? null : 'touch-none',
        )}
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
