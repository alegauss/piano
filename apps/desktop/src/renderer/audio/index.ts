import { WebAudioClicker, type Clicker } from './clicker'
import type { AudioTime, PianoEngine } from './engine'
import { EngineSwitch } from './engine-switch'
import { PackBank, type PackSource } from './pack-bank'
import { SampledEngine } from './sampled-engine'
import { SynthEngine } from './synth-engine'

export type { Clicker } from './clicker'
export type { AudioTime, EngineKind, PianoEngine } from './engine'
export { urlPackSource, type PackProgress, type PackSource } from './pack-bank'
export type { PackBank } from './pack-bank'
export type { Clock, LoopRange, Performance, StrikeEvent } from './scheduler'
export { Transport, type StrikeSource, type TransportStatus } from './transport'

/** What the rest of the renderer gets from the audio layer: an engine and the clock it runs on. */
export type Piano = {
  /** The engine to drive. It may change underneath; nothing above this seam needs to know. */
  readonly engine: PianoEngine
  /** The metronome's voice, on the same clock and its own gain, for a transport to click with. */
  readonly clicker: Clicker
  /** The audio clock, which is the only clock a note may be scheduled against. */
  now(): AudioTime
  /** Start the clock where the platform holds audio until a gesture. */
  resume(): Promise<void>
  /**
   * Hand playing to a sample pack.
   *
   * The switch is immediate: a key whose recordings have not arrived plays
   * synthesised until they do, while the pack loads outward from middle C
   * behind it. Resolves once the manifest is read, not once it is loaded.
   */
  usePack(source: PackSource, options?: { readonly budgetBytes?: number }): Promise<PackBank>
}

/** A piano on a given context; createPiano's, or an offline one in a test. */
export function pianoOn(
  context: BaseAudioContext,
  resume: () => Promise<void> = () => Promise.resolve(),
): Piano {
  const engine = new EngineSwitch(new SynthEngine(context))
  return {
    engine,
    clicker: new WebAudioClicker(context),
    now: () => context.currentTime,
    resume,
    usePack: async (source, options) => {
      const bank = await PackBank.open(context, source, options)
      await engine.use(new SampledEngine(context, bank, { fallback: true }))
      void bank.preload().catch(() => {})
      return bank
    },
  }
}

/**
 * The one door into sound.
 *
 * It starts on the synthesised engine, which needs nothing loaded, so the
 * first note sounds at once, and moves to recordings through usePack.
 */
export function createPiano(): Piano {
  const context = new AudioContext({ latencyHint: 'interactive' })
  return pianoOn(context, () => context.resume())
}
