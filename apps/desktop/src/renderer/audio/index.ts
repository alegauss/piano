import type { AudioTime, PianoEngine } from './engine'
import { EngineSwitch } from './engine-switch'
import { SynthEngine } from './synth-engine'

export type { AudioTime, EngineKind, PianoEngine } from './engine'

/** What the rest of the renderer gets from the audio layer: an engine and the clock it runs on. */
export type Piano = {
  /** The engine to drive. It may change underneath; nothing above this seam needs to know. */
  readonly engine: PianoEngine
  /** The audio clock, which is the only clock a note may be scheduled against. */
  now(): AudioTime
  /** Start the clock where the platform holds audio until a gesture. */
  resume(): Promise<void>
}

/**
 * The one door into sound.
 *
 * It starts on the synthesised engine, which needs nothing loaded, so the
 * first note sounds at once. The sampled engine takes over through the switch
 * when a sample pack is loaded (PI21).
 */
export function createPiano(): Piano {
  const context = new AudioContext({ latencyHint: 'interactive' })
  const engine = new EngineSwitch(new SynthEngine(context))
  return {
    engine,
    now: () => context.currentTime,
    resume: () => context.resume(),
  }
}
