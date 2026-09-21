import { partOf, type Note } from '@piano/score-format'

import { barRange, gridLines } from './bars'
import type { Outcome, TimingMark } from './grading'
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
import type { CanvasPalette, CanvasToken } from './theme'
import { DASH_HEIGHT, laneDashes, laneOf } from './timing-lane'

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

/**
 * The colour a judged note is drawn in. Early and late share one: what they
 * have in common is the note being right and the moment being wrong, and a
 * fourth colour to tell two halves of that apart is a legend nobody reads.
 */
export const JUDGED_TOKENS: Readonly<Record<Exclude<Outcome, 'missed'>, CanvasToken>> = {
  correct: '--judge-correct',
  early: '--judge-late',
  late: '--judge-late',
  wrong: '--judge-wrong',
}

/** How visible a note nobody played stays as it goes by, and how thick its outline is. */
const MISSED_ALPHA = 0.2
const MISSED_LINE = 1.5

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
  /**
   * What the player made of a note, for the ones anything has been made of.
   * Null leaves the note its part's colour, which is what listening looks
   * like.
   */
  readonly judged?: (note: Note) => Outcome | null
  /** How early or late recent strikes were, for the lane above the strike line. */
  readonly timings?: {
    readonly marks: readonly TimingMark[]
    /** The audio clock now, which the marks were stamped on. */
    readonly now: number
    readonly window: number
  }
}

/** How many steps a fading dash's opacity is drawn in: one fill per step and colour. */
const FADE_STEPS = 4

/** How faint the lane's middle line is. */
const LANE_MIDDLE_ALPHA = 0.35

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
  // A note nobody played is left visibly unplayed rather than vanishing, so
  // it is outlined instead of filled and kept out of the colour batches.
  const missed = new Path2D()
  let missing = false
  const stats = forEachVisible(score, view, (note) => {
    const box = noteBox(note, view)
    if (box === null) {
      return
    }
    const look = options.judged?.(note) ?? null
    if (look === 'missed') {
      missing = true
      missed.roundRect(box.x, box.y, box.width, box.height, NOTE_RADIUS)
      return
    }
    const colour =
      palette[
        look === null ? (score.colours.get(partOf(note)) ?? '--note-part-1') : JUDGED_TOKENS[look]
      ]
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
  if (missing) {
    context.fillStyle = palette['--judge-wrong']
    context.globalAlpha = MISSED_ALPHA
    context.fill(missed)
    context.globalAlpha = 1
    context.lineWidth = MISSED_LINE
    context.strokeStyle = palette['--judge-wrong']
    context.stroke(missed)
  }

  if (options.timings !== undefined) {
    drawTimingLane(context, view, palette, options.timings)
  }

  // The strike line last, so a note crossing it passes underneath.
  context.fillStyle = palette['--roll-strike-line']
  context.fillRect(0, view.height - STRIKE_HEIGHT, view.width, STRIKE_HEIGHT)
  return stats
}

/**
 * The lane of recent strikes, over the notes arriving at the strike line.
 *
 * Only while there is something in it, and batched like the notes: one path
 * per colour and fade step, so a fast passage costs a handful of fills.
 */
function drawTimingLane(
  context: CanvasRenderingContext2D,
  view: RollView,
  palette: CanvasPalette,
  timings: NonNullable<RollOptions['timings']>,
): void {
  const lane = laneOf(view.height)
  const dashes = laneDashes(timings.marks, timings.now, timings.window, view.width, lane)
  if (dashes.length === 0) {
    return
  }
  context.globalAlpha = LANE_MIDDLE_ALPHA
  context.fillStyle = palette['--text-muted']
  context.fillRect(0, Math.round(lane.middle), view.width, 1)

  const batches = new Map<string, { colour: string; alpha: number; path: Path2D }>()
  for (const dash of dashes) {
    const step = Math.ceil(dash.alpha * FADE_STEPS)
    const name = `${dash.colour}|${String(step)}`
    let batch = batches.get(name)
    if (batch === undefined) {
      batch = { colour: palette[dash.colour], alpha: step / FADE_STEPS, path: new Path2D() }
      batches.set(name, batch)
    }
    batch.path.rect(dash.x, dash.y - DASH_HEIGHT / 2, dash.width, DASH_HEIGHT)
  }
  for (const batch of batches.values()) {
    context.globalAlpha = batch.alpha
    context.fillStyle = batch.colour
    context.fill(batch.path)
  }
  context.globalAlpha = 1
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
