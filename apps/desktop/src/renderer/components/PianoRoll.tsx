import { partOf, type Note, type ResolvedTiming } from '@piano/score-format'
import { useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '../lib/cn'
import {
  DEFAULT_LEAD_SECONDS,
  noteBox,
  partColours,
  soundingPitches,
  visibleNotes,
  type RollView,
} from '../lib/roll'
import type { CanvasPalette, CanvasToken } from '../lib/theme'
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
  readonly className?: string
}

export function PianoRoll({
  timing,
  notes,
  position = () => 0,
  tempoScale = () => 1,
  leadSeconds = DEFAULT_LEAD_SECONDS,
  className,
}: PianoRollProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const palette = useCanvasPalette()
  const [sounding, setSounding] = useState<ReadonlyMap<number, KeyState>>(new Map())
  // One colour per part, settled when the score changes rather than per frame.
  const colours = useMemo(() => partColours(notes), [notes])

  // The draw loop reads these through a ref so that changing the lead or the
  // score does not tear down and rebuild the loop mid-flight. Kept current
  // after each render rather than during it, which is not a ref's moment.
  const frame = useRef({ timing, notes, position, tempoScale, leadSeconds, palette, colours })
  useEffect(() => {
    frame.current = { timing, notes, position, tempoScale, leadSeconds, palette, colours }
  })

  useEffect(() => {
    const element = canvas.current
    if (element === null) {
      return
    }
    let running = true
    let shown: readonly number[] = []

    const draw = () => {
      if (!running) {
        return
      }
      const current = frame.current
      const view = fit(element, current.position(), current)
      if (view !== null) {
        paint(element, view, current.notes, current.colours, current.palette)
        const pitches = soundingPitches(current.notes, view.position)
        // Only when the chord changes: 88 keys re-rendering every frame buys
        // nothing, since a key is struck a few times a second at most.
        if (pitches.length !== shown.length || pitches.some((p, i) => p !== shown[i])) {
          shown = pitches
          setSounding(new Map<number, KeyState>(pitches.map((pitch) => [pitch, 'sounding'])))
        }
      }
      requestAnimationFrame(draw)
    }
    requestAnimationFrame(draw)

    return () => {
      running = false
    }
  }, [])

  return (
    <div className={cn('flex w-full flex-col', className)}>
      <canvas
        ref={canvas}
        role="img"
        aria-label="Falling notes"
        /* min-h-0 or the canvas insists on its own 2:1 intrinsic size and
           squeezes the keyboard out of the column. */
        className="w-full min-h-0 flex-1 rounded-t-(--radius)"
      />
      <PianoKeyboard states={sounding} className="shrink-0" />
    </div>
  )
}

/**
 * Match the backing store to the box and the display, and say what is on
 * screen. Null while the element has no size, which is every layout's first
 * frame.
 */
function fit(
  canvas: HTMLCanvasElement,
  position: number,
  current: {
    readonly timing: ResolvedTiming
    readonly tempoScale: () => number
    readonly leadSeconds: number
  },
): RollView | null {
  const box = canvas.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) {
    return null
  }
  const ratio = window.devicePixelRatio || 1
  const width = Math.round(box.width * ratio)
  const height = Math.round(box.height * ratio)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  return {
    timing: current.timing,
    position,
    leadSeconds: current.leadSeconds,
    tempoScale: current.tempoScale(),
    width: box.width,
    height: box.height,
  }
}

function paint(
  canvas: HTMLCanvasElement,
  view: RollView,
  notes: readonly Note[],
  colours: ReadonlyMap<string, CanvasToken>,
  palette: CanvasPalette,
): void {
  const context = canvas.getContext('2d')
  if (context === null) {
    return
  }
  const ratio = canvas.width / view.width
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, view.width, view.height)
  context.fillStyle = palette['--roll-background']
  context.fillRect(0, 0, view.width, view.height)

  for (const note of visibleNotes(notes, view)) {
    const box = noteBox(note, view)
    if (box === null) {
      continue
    }
    context.fillStyle = palette[colours.get(partOf(note)) ?? '--note-part-1']
    context.beginPath()
    context.roundRect(box.x, box.y, box.width, box.height, 3)
    context.fill()
  }

  // The strike line last, so a note crossing it passes underneath.
  context.fillStyle = palette['--roll-strike-line']
  context.fillRect(0, view.height - 2, view.width, 2)
}
