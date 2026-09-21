import type { PianoBridge } from '@piano/ipc'
import type { Credit } from '@piano/sample-pack'

import { createPiano, type PackBank, type PackSource, type Piano } from '../audio'
import { readBridge } from '../bridge'

/**
 * Which piano the app is playing with, and how far along its recordings are.
 *
 * Never modal: the app plays synthesised from the first moment, and this only
 * says what is sounding and how much of the pack has arrived. A missing or
 * broken pack is a line of text, not an error screen, because the app works
 * without one.
 */
export type SoundState =
  | { readonly kind: 'starting' }
  | { readonly kind: 'synth'; readonly reason: string }
  | {
      readonly kind: 'sampled'
      readonly credit: Credit
      readonly loaded: number
      readonly total: number
    }
  | { readonly kind: 'failed'; readonly message: string }

export type Sound = {
  readonly state: SoundState
  /** For useSyncExternalStore, which calls it detached, hence a property and not a method. */
  readonly subscribe: (listener: () => void) => () => void
  /** Look for the installed pack and move onto it. Safe to call more than once. */
  readonly start: () => void
}

/** The installed pack, one file at a time across the bridge. */
export function bridgePackSource(bridge: PianoBridge, manifest: unknown): PackSource {
  return {
    manifest: () => Promise.resolve(manifest),
    file: async (path) => {
      const { bytes } = await bridge.packFile({ path })
      // decodeAudioData takes the buffer over, so it gets one of its own.
      return bytes.slice().buffer
    },
  }
}

export function createSound(
  bridge: PianoBridge | null,
  piano: () => Pick<Piano, 'usePack'>,
): Sound {
  let state: SoundState = { kind: 'starting' }
  let started = false
  const listeners = new Set<() => void>()
  const report = (next: SoundState) => {
    state = next
    for (const listener of listeners) {
      listener()
    }
  }

  const begin = async () => {
    if (bridge === null) {
      report({ kind: 'synth', reason: 'this page is not running inside the app' })
      return
    }
    const found = await bridge.packManifest()
    if (!found.installed) {
      report({ kind: 'synth', reason: `no sample pack is installed in ${found.location}` })
      return
    }
    const bank: PackBank = await piano().usePack(bridgePackSource(bridge, found.manifest))
    const show = () => {
      const { loaded, total } = bank.progress
      report({ kind: 'sampled', credit: bank.credit, loaded, total })
    }
    show()
    bank.onProgress(show)
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
    start: () => {
      if (started) {
        return
      }
      started = true
      begin().catch((error: unknown) => {
        report({ kind: 'failed', message: error instanceof Error ? error.message : String(error) })
      })
    },
  }
}

let piano: Piano | null = null
let sound: Sound | null = null

/**
 * The app's one piano. One AudioContext for the whole renderer, whatever
 * mounts twice: React's strict mode runs effects twice on purpose.
 */
export function appPiano(): Piano {
  piano ??= createPiano()
  return piano
}

export function appSound(): Sound {
  sound ??= createSound(readBridge(), appPiano)
  return sound
}
