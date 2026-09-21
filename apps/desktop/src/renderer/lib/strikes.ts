import type { StrikeEvent } from '../audio'
import { keyRect } from './keyboard-geometry'
import type { CanvasPalette } from './theme'

/**
 * The moment a note reaches the keyboard: a burst of particles and a flash
 * across its key.
 *
 * It looks like polish and it is really feedback. The eye needs somewhere to
 * catch the instant of the strike, and without it the roll reads as a list
 * scrolling past rather than as contact.
 *
 * Two rules shape the implementation. Strikes arrive from the scheduler with
 * the audio time they sound at, and fire when the clock reaches that time,
 * not when a frame happens to notice them. And nothing here allocates while
 * it runs: the particles live in a pool fixed at construction, because an
 * effect that allocates during a dense passage causes the stutter it was
 * meant to celebrate. When the pool is full the oldest particle is taken,
 * which is the one nobody is looking at any more.
 */

/** How many particles can be alive at once. A dense chord throws about eighty. */
const POOL = 512

/** How long a particle lives, in seconds. */
const PARTICLE_LIFE = 0.55

/** How long a key stays flashed after its strike, in seconds. */
const FLASH_LIFE = 0.18

/** Particles at the softest and the hardest strike. */
const MIN_PARTICLES = 3
const MAX_PARTICLES = 14

/** How fast a particle leaves the key, in fractions of the field's height a second. */
const SPEED = 0.55

type Particle = {
  /** Alive when life is above zero. */
  life: number
  born: number
  x: number
  y: number
  vx: number
  vy: number
  size: number
}

/**
 * Deterministic scatter.
 *
 * Math.random would make the same strike look different in two runs, which
 * is exactly what a test cannot assert on. This is seeded by the strike, so
 * a burst is reproducible and still looks scattered.
 */
function spread(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43_758.545_3
  return x - Math.floor(x)
}

export class StrikeField {
  private readonly pool: Particle[]
  private next = 0
  /** Strikes scheduled ahead of the clock, waiting for their moment. */
  private pending: { pitch: number; velocity: number; at: number }[] = []
  /** Pitch to the audio time it was struck at, for the flash. */
  private readonly struck = new Map<number, number>()
  private fired = 0

  constructor(size: number = POOL) {
    this.pool = Array.from({ length: size }, () => ({
      life: 0,
      born: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 0,
    }))
  }

  /** Take a strike, or word that what is pending will never sound. */
  take(event: StrikeEvent): void {
    if (event.kind === 'silence') {
      this.pending = []
      return
    }
    this.pending.push({ pitch: event.pitch, velocity: event.velocity, at: event.at })
  }

  /** Particles alive, which is what a test counts and the pool bounds. */
  get alive(): number {
    let alive = 0
    for (const particle of this.pool) {
      if (particle.life > 0) {
        alive += 1
      }
    }
    return alive
  }

  /** How many strikes have fired: a pending strike is not one. */
  get fireCount(): number {
    return this.fired
  }

  /**
   * Bring the field up to the clock: fire the strikes that are due and age
   * everything alive. The field's size is needed because a burst starts at
   * its key, which moves when the window does.
   */
  update(now: number, width: number, height: number): void {
    // Strikes are handed over in the order they sound, so the due ones are
    // always at the front. Shifting mutates rather than building a new list.
    while (this.pending.length > 0 && (this.pending[0]?.at ?? Infinity) <= now) {
      const strike = this.pending.shift()
      if (strike !== undefined) {
        this.fire(strike.pitch, strike.velocity, now, width, height)
      }
    }
    for (const particle of this.pool) {
      if (particle.life > 0) {
        particle.life = Math.max(0, PARTICLE_LIFE - (now - particle.born))
      }
    }
    for (const [pitch, at] of this.struck) {
      if (now - at > FLASH_LIFE) {
        this.struck.delete(pitch)
      }
    }
  }

  /** How brightly each key is flashing, 1 at the strike down to 0. For a caller that asks. */
  flashes(now: number): Map<number, number> {
    const strengths = new Map<number, number>()
    for (const [pitch, at] of this.struck) {
      const left = 1 - (now - at) / FLASH_LIFE
      if (left > 0) {
        strengths.set(pitch, left)
      }
    }
    return strengths
  }

  /** The burst and the flash, over the field that has already been drawn. */
  draw(
    context: CanvasRenderingContext2D,
    now: number,
    view: { readonly width: number; readonly height: number },
    palette: CanvasPalette,
  ): void {
    context.fillStyle = palette['--key-white-pressed']
    for (const [pitch, at] of this.struck) {
      const strength = 1 - (now - at) / FLASH_LIFE
      const key = strength > 0 ? keyRect(pitch, view.width) : null
      if (key === null) {
        continue
      }
      context.globalAlpha = 0.5 * strength
      const height = view.height * 0.08 * strength
      context.fillRect(key.x, view.height - height, key.width, height)
    }

    context.fillStyle = palette['--key-white']
    for (const particle of this.pool) {
      if (particle.life <= 0) {
        continue
      }
      const left = particle.life / PARTICLE_LIFE
      const age = PARTICLE_LIFE - particle.life
      // Bright for most of the flight and gone at the end, rather than
      // half-faded throughout, which reads as dirt on the screen.
      context.globalAlpha = Math.min(1, left * 1.6)
      context.fillRect(
        particle.x + particle.vx * age,
        // Thrown up, and pulled back down as it fades.
        particle.y + particle.vy * age + view.height * 0.6 * age * age,
        particle.size,
        particle.size,
      )
    }
    context.globalAlpha = 1
  }

  private fire(pitch: number, velocity: number, now: number, width: number, height: number): void {
    const key = keyRect(pitch, width)
    if (key === null) {
      return
    }
    this.fired += 1
    this.struck.set(pitch, now)
    // A loud note throws more, faster, and bigger: the burst has to look
    // like what was heard.
    const force = Math.min(1, Math.max(0, velocity / 127))
    const count = Math.round(MIN_PARTICLES + force * (MAX_PARTICLES - MIN_PARTICLES))
    const size = 2.5 + force * 3
    for (let index = 0; index < count; index += 1) {
      const seed = pitch * 7 + index + now
      const sideways = (spread(seed) - 0.5) * 2
      const particle = this.pool[this.next]
      this.next = (this.next + 1) % this.pool.length
      if (particle === undefined) {
        return
      }
      particle.life = PARTICLE_LIFE
      particle.born = now
      particle.x = key.x + key.width * spread(seed + 1)
      // Just above the line rather than on it: a particle born exactly at
      // the strike line is half off the field at the instant it matters.
      particle.y = height - size
      // A fan wider than the key, so the burst is seen against the field
      // rather than only against the note it came from.
      particle.vx = sideways * width * 0.035 * (0.5 + force)
      particle.vy = -height * SPEED * (0.4 + force) * (0.6 + spread(seed + 2) * 0.8)
      particle.size = size
    }
  }
}
