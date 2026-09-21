import { describe, expect, it } from 'vitest'

import { replace } from './replace'

/** A rename Windows refuses for a moment, and one it refuses for good. */

const refusal = (code: string) => Object.assign(new Error(code), { code })

describe('moving a file into place', () => {
  it('tries again while Windows briefly refuses, and gets there', async () => {
    let tries = 0
    const waits: number[] = []
    await replace(
      'a.partial',
      'a',
      () => {
        tries += 1
        return tries < 3 ? Promise.reject(refusal('EPERM')) : Promise.resolve()
      },
      (ms) => {
        waits.push(ms)
        return Promise.resolve()
      },
    )
    expect(tries).toBe(3)
    expect(waits).toEqual([10, 20])
  })

  it('fails at once for anything that is not a passing refusal', async () => {
    let tries = 0
    await expect(
      replace(
        'a.partial',
        'a',
        () => {
          tries += 1
          return Promise.reject(refusal('ENOENT'))
        },
        () => Promise.resolve(),
      ),
    ).rejects.toThrow('ENOENT')
    expect(tries).toBe(1)
  })

  it('gives up in the end rather than waiting for ever', async () => {
    let waited = 0
    await expect(
      replace(
        'a.partial',
        'a',
        () => Promise.reject(refusal('EBUSY')),
        (ms) => {
          waited += ms
          return Promise.resolve()
        },
      ),
    ).rejects.toThrow('EBUSY')
    expect(waited).toBeGreaterThanOrEqual(2000)
    expect(waited).toBeLessThan(2400)
  })
})
