import type {
  AppInfoResponse,
  LinkAnswerRequest,
  LinkCommandPush,
  PackFileRequest,
  PackFileResponse,
  PackManifestResponse,
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
  /** The installed sample pack's manifest, or where there is none. */
  readonly packManifest: () => Promise<PackManifestResponse>
  /** One recording the installed pack's manifest names. */
  readonly packFile: (request: PackFileRequest) => Promise<PackFileResponse>
  /**
   * Be told when Claude Code asks this window to do something. Returns the
   * way to stop being told, since a view that subscribes also unmounts.
   */
  readonly onLinkCommand: (listener: (push: LinkCommandPush) => void) => () => void
  /** Say what became of a command, by the id it arrived with. */
  readonly answerLinkCommand: (answer: LinkAnswerRequest) => Promise<null>
}
