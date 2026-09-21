/**
 * How long frames are taking, kept in a fixed ring.
 *
 * A draw loop cannot be judged by an average: a roll that holds 4ms and
 * spikes to 40 in the densest bar reads as a stutter exactly where the music
 * matters, and the average hides it. So the question asked here is always a
 * percentile, and the samples live in a ring that never grows, because a
 * measurement that allocates is a measurement that changes what it measures.
 */

const SAMPLES = 120

export class FrameTimes {
  private readonly times = new Float64Array(SAMPLES)
  private next = 0
  private filled = 0

  record(milliseconds: number): void {
    this.times[this.next] = milliseconds
    this.next = (this.next + 1) % SAMPLES
    this.filled = Math.min(SAMPLES, this.filled + 1)
  }

  get count(): number {
    return this.filled
  }

  /** The slowest frame in the ring, which is the one that shows. */
  get worst(): number {
    let worst = 0
    for (let index = 0; index < this.filled; index += 1) {
      worst = Math.max(worst, this.times[index] ?? 0)
    }
    return worst
  }

  /** A percentile, 0 to 1, of the frames held. Zero before anything is recorded. */
  percentile(fraction: number): number {
    if (this.filled === 0) {
      return 0
    }
    const sorted = Array.from(this.times.slice(0, this.filled)).sort((a, b) => a - b)
    const at = Math.min(this.filled - 1, Math.max(0, Math.ceil(fraction * this.filled) - 1))
    return sorted[at] ?? 0
  }

  reset(): void {
    this.next = 0
    this.filled = 0
  }
}

/** Sixty frames a second: the budget one frame has to do everything in. */
export const FRAME_BUDGET_MS = 1000 / 60
