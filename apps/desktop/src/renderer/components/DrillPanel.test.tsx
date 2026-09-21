import type { Section } from '@piano/score-format'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Drill, DrillRequest, DrillState } from '../lib/drill'
import { HANDS } from '../lib/parts'
import { DrillPanel } from './DrillPanel'

/**
 * The panel over a drill that does nothing: what is asserted is the request it
 * builds and what it says while one is running.
 */

const RESTING: DrillState = {
  running: false,
  range: null,
  hands: HANDS,
  tempoScale: 1,
  passes: 0,
  clean: 0,
  last: null,
}

function stub(state: DrillState = RESTING) {
  const started: DrillRequest[] = []
  const stopped = vi.fn()
  const drill: Drill = {
    get state() {
      return state
    },
    subscribe: () => () => {},
    use: () => {},
    start: (request) => started.push(request),
    stop: stopped,
    close: () => {},
  }
  return { drill, started, stopped }
}

async function open(drill: Drill, sections: readonly Section[] = []) {
  render(
    <DrillPanel
      drill={drill}
      sections={sections}
      loop={{ start: 1920, end: 3840 }}
      currentBars={() => ({ start: 0, end: 1920 })}
    />,
  )
  fireEvent.click(screen.getByLabelText('Practice'))
  await screen.findByText('Practice', { selector: 'h2' })
}

describe('DrillPanel', () => {
  it('drills the stretch already marked on the roll', async () => {
    const { drill, started } = stub()
    await open(drill)
    fireEvent.click(screen.getByText('Start'))

    expect(started[0]?.range).toEqual({ kind: 'ticks', start: 1920, end: 3840 })
  })

  it('asks for one hand, its own tempo and the count-in, in one request', async () => {
    const { drill, started } = stub()
    await open(drill)
    fireEvent.click(screen.getByText('Left'))
    fireEvent.click(screen.getByText('50%'))
    fireEvent.click(screen.getByLabelText('The other hand plays along'))
    fireEvent.click(screen.getByLabelText('Count in each repetition'))
    fireEvent.click(screen.getByText('Start'))

    expect(started[0]).toMatchObject({
      hands: ['left'],
      other: 'silent',
      from: 0.5,
      countIn: true,
    })
  })

  it('offers a named passage where the score has one', async () => {
    const { drill, started } = stub()
    await open(drill, [{ id: 'chorus', label: 'Chorus', startTick: 0, endTick: 1920 }])
    fireEvent.click(screen.getByText('Chorus'))
    fireEvent.click(screen.getByText('Start'))

    expect(started[0]?.range).toEqual({ kind: 'section', id: 'chorus' })
  })

  it('says where the drill has got to while it runs', async () => {
    const { drill } = stub({
      running: true,
      range: { start: 0, end: 1920 },
      hands: ['left'],
      tempoScale: 0.75,
      passes: 3,
      clean: 2,
      last: 'clean',
    })
    await open(drill)

    const progress = screen.getByTestId('drill-progress').textContent ?? ''
    expect(progress).toContain('Repetition 4')
    expect(progress).toContain('2 clean')
    expect(progress).toContain('75%')
    expect(screen.getByTestId('drill-last').textContent).toContain('a step faster')
  })

  it('says a failed repetition drops back', async () => {
    const { drill } = stub({ ...RESTING, running: true, last: 'faulty' })
    await open(drill)
    expect(screen.getByTestId('drill-last').textContent).toContain('drops back')
  })

  it('stops the drill when asked', async () => {
    const { drill, stopped } = stub({ ...RESTING, running: true })
    await open(drill)
    fireEvent.click(screen.getByText('Stop'))
    expect(stopped).toHaveBeenCalled()
  })
})
