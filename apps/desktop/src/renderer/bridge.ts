/**
 * What the preload exposes on `window`.
 *
 * Declared here rather than imported from the preload: the renderer is a
 * separate TypeScript project on purpose, and letting it reach into
 * `src/preload` would make the trust boundary a folder name. PI3 moves this
 * into the shared package so both sides check against one declaration.
 */
export type PianoBridge = {
  readonly versions: {
    readonly electron: string
    readonly chrome: string
    readonly node: string
  }
}

declare global {
  interface Window {
    readonly piano?: PianoBridge
  }
}

export function readBridge(): PianoBridge | null {
  return window.piano ?? null
}
