import type {
  AppInfoResponse,
  ExportRequest,
  ExportResult,
  HistoryReadResponse,
  HistorySaveResult,
  HistoryWriteRequest,
  KeepRequest,
  KeepResult,
  LinkAnswerRequest,
  LibraryCorrectRequest,
  LibraryCorrectResult,
  LibraryItem,
  LibraryLeft,
  LibraryQuery,
  LibrarySaveRequest,
  LibrarySaveResult,
  LinkCommandPush,
  OpenRequest,
  OpenResult,
  PackDownloadResponse,
  PackFileRequest,
  PackFileResponse,
  PackManifestResponse,
  PackProgressPush,
  PackSourceResponse,
  RecentEntry,
  SettingsReadResponse,
  WindowSetTitleRequest,
  WindowSetTitleResponse,
} from './channels'
import type { Settings, SettingsPatch } from './settings'

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
  /**
   * Open a score from the dialog, the recent list, the library or whatever
   * the app was launched with. A dropped file has its own door below.
   */
  readonly openScore: (request: Exclude<OpenRequest, { from: 'dropped' }>) => Promise<OpenResult>
  /**
   * Open a file somebody dropped on the window. It takes the dropped File
   * itself rather than a path: the preload asks Electron where it is, so a
   * page can only ever open a file a person really dropped. Typed as an object
   * because this contract carries no DOM.
   */
  readonly openDroppedFile: (file: object) => Promise<OpenResult>
  /** The scores opened lately, newest first. */
  readonly recentScores: () => Promise<RecentEntry[]>
  /** Be told when main opened a score: from the menu, the file manager or a second launch. */
  readonly onScoreOpened: (listener: (result: OpenResult) => void) => () => void
  /** The library, searched and in the order asked for. */
  readonly libraryScores: (query: LibraryQuery) => Promise<LibraryItem[]>
  /** What is in the library folder that never became a score, and why. */
  readonly libraryLeftBehind: () => Promise<LibraryLeft[]>
  /** Put the score being shown into the library, main deciding where it goes. */
  readonly saveToLibrary: (request: LibrarySaveRequest) => Promise<LibrarySaveResult>
  /** Correct what a filed piece says about itself, answered with the score as now kept. */
  readonly correctInLibrary: (request: LibraryCorrectRequest) => Promise<LibraryCorrectResult>
  /** Be told when a score arrives in the library folder, or leaves it. */
  readonly onLibraryChanged: (listener: () => void) => () => void
  /** What the app remembers between launches, and whether any of it had to be reset. */
  readonly readSettings: () => Promise<SettingsReadResponse>
  /** Change some settings; all of them come back as now kept. */
  readonly writeSettings: (patch: SettingsPatch) => Promise<Settings>
  /** Every setting back to its default. */
  readonly resetSettings: () => Promise<Settings>
  /** Every attempt kept so far, and whether any of it could not be read. */
  readonly readHistory: () => Promise<HistoryReadResponse>
  /** Keep the history as the window now holds it. */
  readonly writeHistory: (request: HistoryWriteRequest) => Promise<null>
  /** Save the history as a file somebody keeps, main asking where. */
  readonly saveHistory: () => Promise<HistorySaveResult>
  /** Erase the history, file and all. */
  readonly clearHistory: () => Promise<null>
  /** The sample pack that could be downloaded, and how big it is. */
  readonly packSource: () => Promise<PackSourceResponse>
  /** Download the sample pack; settles once it is installed, or has stopped. */
  readonly downloadPack: () => Promise<PackDownloadResponse>
  /** Stop the download, keeping what arrived. */
  readonly cancelPackDownload: () => Promise<null>
  /** Be told how far the download has got. */
  readonly onPackProgress: (listener: (progress: PackProgressPush) => void) => () => void
  /** Save the score being shown as a MIDI file, main asking where. */
  readonly exportScore: (request: ExportRequest) => Promise<ExportResult>
  /** Be told the menu asked for the open score as MIDI. */
  readonly onExportRequested: (listener: () => void) => () => void
  /** Keep a worked-out arrangement in the open score's file, answered with the score as kept. */
  readonly keepArrangement: (request: KeepRequest) => Promise<KeepResult>
}
