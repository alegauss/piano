import { partOf } from '@piano/score-format'

import { forEachVisible, noteBox, type RollScore, type RollStats, type RollView } from './roll'
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

export function drawRoll(
  context: CanvasRenderingContext2D,
  view: RollView,
  score: RollScore,
  palette: CanvasPalette,
): RollStats {
  context.fillStyle = palette['--roll-background']
  context.fillRect(0, 0, view.width, view.height)

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
