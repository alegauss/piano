import type { PedalKind, Score } from '@piano/score-format'

import type { AudioTime, EngineKind, PianoEngine } from './engine'

/**
 * The engine everything above the seam holds, which can change underneath.
 *
 * The synthesised engine plays while samples load and the sampled one takes
 * over when they arrive, in the middle of a piece. So a swap cannot cut what
 * is sounding, and it cannot strand a note either: a key struck on the old
 * engine has its release sent to the old engine, which is retired once its
 * last key is up. Pedals and master gain go to every engine still sounding.
 */
export class EngineSwitch implements PianoEngine {
  private engine: PianoEngine
  /** The current engine and any retiring one still waiting for its keys to come up. */
  private readonly live = new Set<PianoEngine>()
  /** Per pitch, the engines holding that key down, oldest strike first. */
  private readonly keysDown = new Map<number, PianoEngine[]>()
  private readonly pedals = new Map<PedalKind, number>()
  private score: Score | null = null
  private gain = 1
  /** The latest time any event has named, which is where a retiring engine lets go. */
  private latest: AudioTime = 0

  constructor(initial: PianoEngine) {
    this.engine = initial
    this.live.add(initial)
  }

  get kind(): EngineKind {
    return this.engine.kind
  }

  /** The engine new notes go to. */
  get current(): PianoEngine {
    return this.engine
  }

  /**
   * Hand playing over to another engine.
   *
   * It is prepared for the current score first, so it takes over only once it
   * can play what is coming, and it inherits the master gain and the pedals
   * as they stand.
   */
  async use(next: PianoEngine): Promise<void> {
    if (next === this.engine) {
      return
    }
    if (this.score !== null) {
      await next.prepare(this.score)
    }
    next.setMasterGain(this.gain)
    for (const [pedal, value] of this.pedals) {
      next.pedal(pedal, value, this.latest)
    }
    const previous = this.engine
    this.engine = next
    this.live.add(next)
    this.retireIfDone(previous)
  }

  async prepare(score: Score): Promise<void> {
    this.score = score
    await this.engine.prepare(score)
  }

  noteOn(pitch: number, velocity: number, at: AudioTime): void {
    this.note(at)
    this.engine.noteOn(pitch, velocity, at)
    const holders = this.keysDown.get(pitch)
    if (holders === undefined) {
      this.keysDown.set(pitch, [this.engine])
    } else {
      holders.push(this.engine)
    }
  }

  noteOff(pitch: number, at: AudioTime): void {
    this.note(at)
    const holder = this.keysDown.get(pitch)?.shift() ?? this.engine
    holder.noteOff(pitch, at)
    this.retireIfDone(holder)
  }

  pedal(pedal: PedalKind, value: number, at: AudioTime): void {
    this.note(at)
    this.pedals.set(pedal, value)
    for (const engine of this.live) {
      engine.pedal(pedal, value, at)
    }
  }

  setMasterGain(gain: number): void {
    this.gain = gain
    for (const engine of this.live) {
      engine.setMasterGain(gain)
    }
  }

  stopAll(): void {
    for (const engine of this.live) {
      engine.stopAll()
    }
    this.keysDown.clear()
    this.pedals.clear()
    for (const engine of [...this.live]) {
      this.retireIfDone(engine)
    }
  }

  retire(at: AudioTime): void {
    for (const engine of this.live) {
      engine.retire(Math.max(at, this.latest))
    }
    this.live.clear()
    this.keysDown.clear()
  }

  private note(at: AudioTime): void {
    this.latest = Math.max(this.latest, at)
  }

  /** A swapped-out engine goes once no key it struck is still down. */
  private retireIfDone(engine: PianoEngine): void {
    if (engine === this.engine || !this.live.has(engine)) {
      return
    }
    for (const holders of this.keysDown.values()) {
      if (holders.includes(engine)) {
        return
      }
    }
    engine.retire(this.latest)
    this.live.delete(engine)
  }
}
