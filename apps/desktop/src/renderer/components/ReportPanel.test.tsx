import { resolveTiming } from '@piano/score-format'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Grader, GraderState } from '../lib/grader'
import {
  grade,
  NO_FEEDBACK,
  type Attempt,
  type Expected,
  type Played,
  type Strictness,
} from '../lib/grading'
import { ReportPanel } from './ReportPanel'

/**
 * The panel over a grader that is standing still: what the report says is the
 * arithmetic's business, and what is asserted here is that a player reading it
 * is told which bars to go back to.
 */

const timing = resolveTiming(undefined)
const QUARTER = timing.ticksPerQuarter
const BAR = QUARTER * 4

function expected(pitch: number, tick: number): Expected {
  return { pitch, tick, velocity: 80 }
}

function strike(pitch: number, tick: number, extra: Partial<Played> = {}): Played {
  return { pitch, velocity: 80, tick, slip: 0, scale: 1, expressive: false, ...extra }
}

/** A grader that holds one report and nothing else: the panel is the subject. */
function stub(attempt: Attempt | null, running = false): Grader {
  const listeners = new Set<() => void>()
  let state: GraderState = {
    strictness: 'steady',
    running,
    taken: 0,
    attempt,
    feedback: NO_FEEDBACK,
  }
  return {
    get state() {
      return state
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setStrictness: (strictness: Strictness) => {
      state = { ...state, strictness }
      for (const listener of listeners) {
        listener()
      }
    },
    use: () => {},
    useLatency: () => {},
    played: () => {},
    close: () => {},
  }
}

async function open(grader: Grader) {
  render(<ReportPanel grader={grader} />)
  fireEvent.click(screen.getByLabelText('How it went'))
  await screen.findByText('How it went', { selector: 'h2' })
}

describe('ReportPanel', () => {
  it('says what to do before there is anything to report', async () => {
    await open(stub(null))
    expect(screen.getByTestId('no-attempt').textContent).toContain('Play a passage')
  })

  it('says it is listening while a pass is running', async () => {
    await open(stub(null, true))
    expect(screen.getByTestId('no-attempt').textContent).toContain('Listening')
  })

  it('counts the notes that were in time, and each way the rest went', async () => {
    const attempt = grade(
      [expected(60, 0), expected(62, QUARTER), expected(64, 2 * QUARTER)],
      [strike(60, 0), strike(63, QUARTER)],
      { timing },
    )
    await open(stub(attempt))

    expect(screen.getByTestId('attempt-headline').textContent).toContain('1 of 3')
    expect(screen.getByTestId('count-wrong-note').textContent).toBe('1')
    expect(screen.getByTestId('count-missed').textContent).toBe('1')
  })

  it('names the bars to go back to rather than a mark out of a hundred', async () => {
    const notes = [0, BAR, 2 * BAR, 3 * BAR].map((tick, index) => expected(60 + index, tick))
    const attempt = grade(notes, [strike(60, 0)], { timing })
    await open(stub(attempt))

    const bars = screen.getByTestId('troubled-bars').textContent ?? ''
    expect(bars).toContain('2–4')
    expect(screen.getByText(/Bar 2: 1 missed/)).toBeTruthy()
  })

  it('says so when every bar came out', async () => {
    const attempt = grade([expected(60, 0)], [strike(60, 0)], { timing })
    await open(stub(attempt))
    expect(screen.getByTestId('troubled-bars').textContent).toContain('Every bar came out')
  })

  it('reports the touch on its own line, and says when it was not graded', async () => {
    await open(stub(grade([expected(60, 0)], [strike(60, 0)], { timing })))
    expect(screen.getByTestId('dynamics').textContent).toContain('not graded')
  })

  it('reports the touch where the input could express it', async () => {
    const attempt = grade([expected(60, 0)], [strike(60, 0, { velocity: 120, expressive: true })], {
      timing,
    })
    await open(stub(attempt))
    expect(screen.getByTestId('dynamics').textContent).toContain('harder than written')
  })

  it('offers the window as a setting, and shows the one in force', async () => {
    const grader = stub(null)
    await open(grader)
    expect(screen.getByText(/120 ms/)).toBeTruthy()

    fireEvent.click(screen.getByText('Strict'))
    expect(screen.getByText(/60 ms/)).toBeTruthy()
    expect(screen.getByText('Strict').getAttribute('aria-pressed')).toBe('true')
  })
})
