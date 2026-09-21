import { partOf } from '@piano/score-format'

import { barRange, gridLines } from './bars'
import { LabelCache } from './label-cache'
import {
  forEachVisible,
  noteBox,
  visibleTicks,
  yAtTick,
  type RollScore,
  type RollStats,
  type RollView,
} from './roll'
import type { CanvasPalette } from './theme'

/**
 * One frame of the roll, on a context the caller owns.
 *
 * Drawing lives here rather than in the component so that the thing under
 * measurement is the thing that runs: the performance test drives this
 * function over a dense fixture, with no React and no frame scheduler in the
 * way to explain a slow result away.
 */

/** How round a note's corners are. */
const NOTE_RADIUS = 3

/** The strike line, where a note meets its key. */
const STRIKE_HEIGHT = 2

/** Bar numbers, at the left edge as in the reference image. */
const LABEL_FONT = '11px ui-monospace, monospace'
const LABEL_LEFT = 6
/** Enough to sit a label just above its bar line. */
const LABEL_HEIGHT = 15

/** What else is on the field besides the notes. */
export type RollOptions = {
  /** A stretch marked for repeat. */
  readonly loop?: { readonly start: number; readonly end: number } | null
  /** A stretch being dragged out now. */
  readonly selecting?: { readonly start: number; readonly end: number } | null
  /**
   * Where bar numbers are kept once rendered. A caller drawing every frame
   * should hold its own; this default serves a one-off draw.
   */
  readonly labels?: LabelCache
}

const sharedLabels = new LabelCache()

export function drawRoll(
  context: CanvasRenderingContext2D,
  view: RollView,
  score: RollScore,
  palette: CanvasPalette,
  options: RollOptions = {},
): RollStats {
  context.fillStyle = palette['--roll-background']
  context.fillRect(0, 0, view.width, view.height)

  drawBands(context, view, palette, options)
  drawGrid(context, view, palette, options.labels ?? sharedLabels)

  // Notes of one colour in one path: a fill per note is the difference
  // between a dense bar costing one draw call per part and hundreds.
  const paths = new Map<string, Path2D>()
  const stats = forEachVisible(score, view, (note) => {
    const box = noteBox(note, view)
    if (box === null) {
      return
    }
    const colour = palette[score.colours.get(partOf(note)) ?? '--note-part-1']
    let path = paths.get(colour)
    if (path === undefined) {
      path = new Path2D()
      paths.set(colour, path)
    }
    path.roundRect(box.x, box.y, box.width, box.height, NOTE_RADIUS)
  })
  for (const [colour, path] of paths) {
    context.fillStyle = colour
    context.fill(path)
  }

  // The strike line last, so a note crossing it passes underneath.
  context.fillStyle = palette['--roll-strike-line']
  context.fillRect(0, view.height - STRIKE_HEIGHT, view.width, STRIKE_HEIGHT)
  return stats
}

/** The bar playing now, and any stretch marked for repeat, behind everything. */
function drawBands(
  context: CanvasRenderingContext2D,
  view: RollView,
  palette: CanvasPalette,
  bands: RollOptions,
): void {
  const band = (start: number, end: number, colour: string, alpha: number) => {
    const top = yAtTick(view, end)
    const bottom = yAtTick(view, start)
    context.globalAlpha = alpha
    context.fillStyle = colour
    context.fillRect(0, top, view.width, bottom - top)
    context.globalAlpha = 1
  }

  // Where am I: the bar under the strike line, lit faintly.
  const here = barRange(view.timing, view.position)
  band(here.start, here.end, palette['--roll-beat-line'], 0.45)

  if (bands.loop != null) {
    band(bands.loop.start, bands.loop.end, palette['--accent'], 0.12)
  }
  if (bands.selecting != null) {
    band(bands.selecting.start, bands.selecting.end, palette['--accent'], 0.2)
  }
}

/**
 * Bar lines, beat lines and bar numbers.
 *
 * Beats are drawn more faintly than bars: that hierarchy is what makes the
 * field readable at a glance rather than a grid of equal lines. Each kind is
 * one path, so the whole grid costs two strokes however many lines it holds.
 */
function drawGrid(
  context: CanvasRenderingContext2D,
  view: RollView,
  palette: CanvasPalette,
  labels: LabelCache,
): void {
  const { from, to } = visibleTicks(view)
  const bars = new Path2D()
  const beats = new Path2D()
  const numbers: { text: string; y: number }[] = []

  for (const line of gridLines(view.timing, from, to)) {
    const y = Math.round(yAtTick(view, line.tick)) + 0.5
    const path = line.downbeat ? bars : beats
    path.moveTo(0, y)
    path.lineTo(view.width, y)
    if (line.downbeat && line.bar > 0) {
      numbers.push({ text: String(line.bar), y })
    }
  }

  context.lineWidth = 1
  context.strokeStyle = palette['--roll-beat-line']
  context.stroke(beats)
  context.strokeStyle = palette['--roll-bar-line']
  context.stroke(bars)

  for (const number of numbers) {
    labels.draw(
      context,
      number.text,
      LABEL_LEFT,
      number.y - LABEL_HEIGHT,
      LABEL_FONT,
      palette['--text-muted'],
    )
  }
}
