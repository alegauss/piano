import { resolveTiming, type Note } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { FRAME_BUDGET_MS, FrameTimes } from './frame-timing'
import { NO_FEEDBACK, noteKey, noteLook, type Feedback, type Outcome } from './grading'
import { forEachVisible, prepareRoll, type RollView } from './roll'
import { drawRoll } from './roll-draw'
import { StrikeField } from './strikes'
import { readCanvasPalette, setTheme } from './theme'

/**
 * The roll at its worst moment, measured rather than assumed.
 *
 * The fixture is deliberately denser than a piano can be played: a cluster on
 * every beat, each note held over the next two, so a three-second window
 * carries a couple of hundred notes with the pedal down. The test drives the
 * drawing directly, with no React and no frame scheduler in the way, and
 * fails on the ninety-fifth percentile rather than the average, because a
 * roll that averages 4ms and spikes to 40 is the one people remember.
 */

const timing = resolveTiming(undefined)
const QUARTER = timing.ticksPerQuarter
const BEATS = 2_000
const PER_BEAT = 25

/** Half a frame for the roll, leaving the other half for everything else. */
const DRAW_BUDGET_MS = FRAME_BUDGET_MS / 2

function densePiece(): Note[] {
  const notes: Note[] = []
  for (let beat = 0; beat < BEATS; beat += 1) {
    for (let voice = 0; voice < PER_BEAT; voice += 1) {
      notes.push({
        pitch: 24 + ((beat * 7 + voice * 3) % 84),
        start: beat * QUARTER,
        duration: 3 * QUARTER,
        velocity: 70,
      })
    }
  }
  return notes
}

function field(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  document.body.append(canvas)
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('no 2d context')
  }
  return { canvas, context }
}

describe('drawing the densest bar', () => {
  const score = prepareRoll(densePiece())
  const view = (position: number): RollView => ({
    timing,
    position,
    leadSeconds: 3,
    tempoScale: 1,
    width: 1600,
    height: 900,
  })

  it('holds the frame budget at the ninety-fifth percentile', () => {
    const { context } = field(1600, 900)
    const palette = readCanvasPalette()
    const times = new FrameTimes()
    // A frame's worth of music at 60fps, from the middle of the piece.
    const step = QUARTER / 30
    let drawn = 0

    for (let frame = 0; frame < 120; frame += 1) {
      const at = view(BEATS * 0.5 * QUARTER + frame * step)
      const started = performance.now()
      const stats = drawRoll(context, at, score, palette)
      times.record(performance.now() - started)
      drawn = stats.drawn
    }

    // The fixture has to be as dense as the test claims, or the budget is
    // being met by drawing nothing.
    expect(drawn).toBeGreaterThan(150)
    expect(times.percentile(0.95)).toBeLessThan(DRAW_BUDGET_MS)
    // And no single frame eats a whole frame, which is what a stutter is.
    // The first one pays to shape the bar numbers; after that they are blits.
    expect(times.worst).toBeLessThan(FRAME_BUDGET_MS)
  })

  /**
   * Block D's own gate, asked exactly as it is written: the densest fixture,
   * in both themes, with the strike effects firing the whole time.
   */
  it.each(['dark', 'light'] as const)('holds it in the %s theme with the effects on', (theme) => {
    setTheme(theme)
    const { context } = field(1600, 900)
    const palette = readCanvasPalette()
    const strikes = new StrikeField()
    const times = new FrameTimes()
    const step = QUARTER / 30

    for (let frame = 0; frame < 120; frame += 1) {
      const position = BEATS * 0.5 * QUARTER + frame * step
      const at = view(position)
      // A chord's worth of strikes every other frame, which is denser than
      // any piano is played.
      const now = frame / 60
      for (let voice = 0; voice < 6; voice += 1) {
        strikes.take({
          kind: 'strike',
          pitch: 40 + ((frame * 7 + voice * 5) % 60),
          velocity: 100,
          at: now,
        })
      }

      const started = performance.now()
      drawRoll(context, at, score, palette)
      strikes.update(now, 1600, 900)
      strikes.draw(context, now, { width: 1600, height: 900 }, palette)
      times.record(performance.now() - started)
    }

    expect(strikes.alive).toBeGreaterThan(0)
    expect(times.percentile(0.95)).toBeLessThan(DRAW_BUDGET_MS)
    expect(times.worst).toBeLessThan(FRAME_BUDGET_MS)
  })

  /**
   * The same field with a judgement on it. The worst case is not the notes
   * that were answered but the ones that were not: a look-up that misses is
   * the one that goes on to ask where the music is.
   */
  it('holds the budget with every note judged', () => {
    const { context } = field(1600, 900)
    const palette = readCanvasPalette()
    const times = new FrameTimes()
    const step = QUARTER / 30
    const notes = new Map<string, Outcome>()
    const owed = new Set<string>()
    score.notes.forEach((note, index) => {
      const key = noteKey(note.start, note.pitch)
      owed.add(key)
      if (index % 2 === 0) {
        notes.set(key, index % 4 === 0 ? 'correct' : 'late')
      }
    })
    const feedback: Feedback = { ...NO_FEEDBACK, notes, owed, attempting: true }

    for (let frame = 0; frame < 120; frame += 1) {
      const at = view(BEATS * 0.5 * QUARTER + frame * step)
      const started = performance.now()
      drawRoll(context, at, score, palette, {
        judged: (note) => noteLook(feedback, note, at),
      })
      times.record(performance.now() - started)
    }

    expect(times.percentile(0.95)).toBeLessThan(DRAW_BUDGET_MS)
    expect(times.worst).toBeLessThan(FRAME_BUDGET_MS)
  })

  it('draws only what is on screen, however long the piece is', () => {
    const stats = forEachVisible(score, view(BEATS * 0.5 * QUARTER), () => {})
    expect(score.notes.length).toBe(BEATS * PER_BEAT)
    expect(stats.drawn).toBeLessThan(400)
    // What it looked at is the window plus the notes still sounding into it,
    // not a walk through fifty thousand notes.
    expect(stats.considered).toBeLessThan(stats.drawn * 2)
  })
})
