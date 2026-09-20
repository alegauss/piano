import type {
  AppInfoResponse,
  WindowSetTitleRequest,
  WindowSetTitleResponse,
} from './channels'

/**
 * What the preload puts on `window.piano`, declared once.
 *
 * The preload implements this type and the renderer consumes it, so neither
 * side describes the bridge in its own words. Named by intent: a method here
 * says what the renderer wants done, never which main-process capability does
 * it, because the next method added has to be argued for on those terms.
 *
 * Types only — this module emits no code, so importing it costs the renderer
 * nothing and drags no dependency across the boundary.
 */
export type PianoBridge = {
  readonly appInfo: () => Promise<AppInfoResponse>
  readonly setWindowTitle: (request: WindowSetTitleRequest) => Promise<WindowSetTitleResponse>
}
