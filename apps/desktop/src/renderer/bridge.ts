import type { PianoBridge } from '@piano/ipc'

/**
 * What the preload exposes on `window`.
 *
 * The type comes from the shared contract rather than from `src/preload`: the
 * renderer must not reach across the trust boundary even for a type, or the
 * boundary becomes a folder name. One declaration, implemented on one side and
 * consumed on the other.
 */
declare global {
  interface Window {
    readonly piano?: PianoBridge
  }
}

export type { PianoBridge }

/**
 * The bridge is absent in a plain browser tab and, briefly, if a preload fails
 * to load. Every caller handles that rather than assuming a privileged host.
 */
export function readBridge(): PianoBridge | null {
  return window.piano ?? null
}
