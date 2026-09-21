import type { PianoBridge } from '@piano/ipc'

import { readBridge } from '../bridge'
import { appSound } from './sound'

/**
 * The sample pack's download, as the window follows it.
 *
 * Offered with its size before anything is fetched, stoppable while it runs,
 * and retried from where it stopped; main does the fetching, so nothing here
 * holds up the page and the piano plays synthesised meanwhile. Once the pack
 * is in place the sound is told to look again and moves onto the recordings,
 * without a restart.
 */

export type DownloadState =
  | { readonly kind: 'unknown' }
  /** Nothing to download: no location is set, or it could not be reached. */
  | { readonly kind: 'unavailable'; readonly reason: string }
  | { readonly kind: 'offered'; readonly bytes: number }
  | { readonly kind: 'downloading'; readonly bytes: number; readonly total: number }
  | { readonly kind: 'installing' }
  | { readonly kind: 'installed' }
  /** Failed or cancelled; what arrived is kept, and trying again continues from it. */
  | { readonly kind: 'stopped'; readonly reason: string; readonly bytes: number }

export type PackDownload = {
  readonly state: DownloadState
  readonly subscribe: (listener: () => void) => () => void
  /** Ask what could be downloaded and how big it is. Once, however often it is asked. */
  readonly check: () => void
  readonly start: () => void
  readonly cancel: () => void
}

type DownloadBridge = Pick<
  PianoBridge,
  'packSource' | 'downloadPack' | 'cancelPackDownload' | 'onPackProgress'
>

export function createPackDownload(
  bridge: DownloadBridge | null,
  /** Told once the pack is in place, so the sound can move onto it. */
  installed: () => void,
): PackDownload {
  let state: DownloadState = { kind: 'unknown' }
  let checked = false
  let size = 0
  const listeners = new Set<() => void>()
  const set = (next: DownloadState) => {
    state = next
    for (const listener of listeners) {
      listener()
    }
  }
  const because = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))

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
    check: () => {
      if (checked || bridge === null) {
        return
      }
      checked = true
      bridge.packSource().then(
        (found) => {
          if (found.available) {
            size = found.bytes
            set({ kind: 'offered', bytes: found.bytes })
          } else {
            set({ kind: 'unavailable', reason: found.reason })
          }
        },
        (cause: unknown) => {
          set({ kind: 'unavailable', reason: because(cause) })
        },
      )
    },
    start: () => {
      if (bridge === null || state.kind === 'downloading' || state.kind === 'installing') {
        return
      }
      set({ kind: 'downloading', bytes: 0, total: size })
      const stop = bridge.onPackProgress((progress) => {
        set(
          progress.phase === 'installing'
            ? { kind: 'installing' }
            : { kind: 'downloading', bytes: progress.bytes, total: progress.total },
        )
      })
      bridge
        .downloadPack()
        .then(
          (answer) => {
            if (answer.installed) {
              set({ kind: 'installed' })
              installed()
            } else {
              set({ kind: 'stopped', reason: answer.reason, bytes: size })
            }
          },
          (cause: unknown) => {
            set({ kind: 'stopped', reason: because(cause), bytes: size })
          },
        )
        .finally(stop)
    },
    cancel: () => {
      void bridge?.cancelPackDownload()
    },
  }
}

let download: PackDownload | null = null

export function appPackDownload(): PackDownload {
  download ??= createPackDownload(readBridge(), () => {
    appSound().reload()
  })
  return download
}
