import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createCalibrator, type Calibrator, type Latency } from '../lib/latency'
import { LatencyPanel } from './LatencyPanel'

function setup(latency: Latency = { output: 0.02, input: 0 }) {
  let now = 100
  const calibrator = createCalibrator({ click: () => {}, stopAll: () => {} }, () => now, {
    strikes: 4,
    interval: 1,
    latency,
  })
  const onMeasured = vi.fn()
  render(
    <LatencyPanel
      latency={latency}
      calibrator={calibrator}
      onMeasured={onMeasured}
      setup="Digital Piano"
    />,
  )
  return { calibrator, onMeasured, at: (time: number) => (now = time) }
}

async function open() {
  fireEvent.click(screen.getByLabelText('Latency'))
  await screen.findByText('Latency', { selector: 'h2' })
}

/** The routine, driven as a player in time with the clicks would drive it. */
function play(calibrator: Calibrator, offset: number) {
  act(() => {
    for (const heard of [102.02, 103.02, 104.02, 105.02]) {
      calibrator.strike(heard + offset)
    }
  })
}

describe('LatencyPanel', () => {
  it('shows both figures, and says which one has not been measured', async () => {
    setup()
    await open()
    expect(screen.getByTestId('output-latency').textContent).toBe('20 ms')
    expect(screen.getByTestId('input-latency').textContent).toBe('not measured')
  })

  it('shows a measured input figure once there is one', async () => {
    setup({ output: 0.02, input: 0.031 })
    await open()
    expect(screen.getByTestId('input-latency').textContent).toBe('31 ms')
  })

  it('counts the strikes while it runs', async () => {
    const { calibrator } = setup()
    await open()
    fireEvent.click(screen.getByText('Calibrate'))
    act(() => {
      calibrator.strike(102.05)
    })
    expect(screen.getByTestId('calibration-progress').textContent).toContain('1 of 4')
  })

  it('reports the figure it measured and offers to keep it', async () => {
    const { calibrator, onMeasured } = setup()
    await open()
    fireEvent.click(screen.getByText('Calibrate'))
    play(calibrator, 0.03)

    expect(screen.getByTestId('calibration-result').textContent).toContain('30 ms')
    fireEvent.click(screen.getByText('Use this figure'))
    expect(onMeasured).toHaveBeenCalledWith(expect.closeTo(0.03, 6))
  })

  it('says out loud when the figure means a broken setup', async () => {
    const { calibrator } = setup()
    await open()
    fireEvent.click(screen.getByText('Calibrate'))
    play(calibrator, 0.4)

    expect(screen.getByTestId('calibration-warning').textContent).toContain('Bluetooth')
  })

  it('says nothing alarming about an ordinary figure', async () => {
    const { calibrator } = setup()
    await open()
    fireEvent.click(screen.getByText('Calibrate'))
    play(calibrator, 0.03)

    expect(screen.queryByTestId('calibration-warning')).toBeNull()
  })

  it('names the setup a calibration belongs to', async () => {
    setup()
    await open()
    expect(screen.getByText(/Digital Piano/)).toBeTruthy()
  })
})
