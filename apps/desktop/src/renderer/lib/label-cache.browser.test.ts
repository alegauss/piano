import { describe, expect, it } from 'vitest'

import { LabelCache } from './label-cache'

const FONT = '11px ui-monospace, monospace'

function context(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = 200
  canvas.height = 80
  const found = canvas.getContext('2d')
  if (found === null) {
    throw new Error('no 2d context')
  }
  return found
}

describe('LabelCache', () => {
  it('renders a label once and copies it after that', () => {
    const cache = new LabelCache()
    const target = context()
    for (let frame = 0; frame < 60; frame += 1) {
      cache.draw(target, '17', 4, 10, FONT, 'white')
    }
    expect(cache.renders).toBe(1)
  })

  it('renders each different label, and each colour, once', () => {
    const cache = new LabelCache()
    const target = context()
    cache.draw(target, '1', 0, 0, FONT, 'white')
    cache.draw(target, '2', 0, 0, FONT, 'white')
    cache.draw(target, '1', 0, 0, FONT, 'black')
    cache.draw(target, '1', 0, 0, FONT, 'white')
    expect(cache.renders).toBe(3)
  })

  it('stays bounded, dropping the labels nobody has asked for lately', () => {
    const cache = new LabelCache(8)
    const target = context()
    for (let bar = 1; bar <= 40; bar += 1) {
      cache.draw(target, String(bar), 0, 0, FONT, 'white')
    }
    expect(cache.size).toBe(8)
    // The recent ones are still there: asking again renders nothing new.
    const before = cache.renders
    cache.draw(target, '40', 0, 0, FONT, 'white')
    expect(cache.renders).toBe(before)
  })

  it('actually puts ink on the canvas', () => {
    const cache = new LabelCache()
    const target = context()
    target.fillStyle = 'black'
    target.fillRect(0, 0, 200, 80)
    cache.draw(target, '88', 4, 10, FONT, 'white')
    const data = target.getImageData(0, 0, 200, 80).data
    let lit = 0
    for (let at = 0; at < data.length; at += 4) {
      if ((data[at] ?? 0) > 100) {
        lit += 1
      }
    }
    expect(lit).toBeGreaterThan(0)
  })
})
