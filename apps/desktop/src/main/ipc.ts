import {
  allChannels,
  appInfo,
  formatIssues,
  libraryList,
  linkAnswer,
  linkListening,
  packCancel,
  packDownload,
  packFile,
  packManifest,
  packSource,
  PUSH_NAMES,
  scoreExport,
  scoreKeepArrangement,
  scoreOpen,
  scoreRecent,
  settingsRead,
  settingsReset,
  settingsWrite,
  windowSetTitle,
  type Channel,
  type ExportRequest,
  type ExportResult,
  type KeepRequest,
  type KeepResult,
  type LibraryItem,
  type LibraryQuery,
  type LinkResult,
  type OpenRequest,
  type OpenResult,
  type RecentEntry,
} from '@piano/ipc'
import { FORMAT_VERSION } from '@piano/score-format'
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'

import type { PackDownloader } from './pack-download'
import { packDirectory, readPackFile, readPackManifest } from './sample-pack'
import type { SettingsStore } from './settings-store'

/**
 * Every channel is registered through this one function, so no handler can
 * quietly skip validation.
 *
 * The request is parsed before the handler sees it, because preload is the
 * trust boundary and the renderer is not: a payload arriving here is input,
 * whoever sent it. The response is parsed on the way out too — that catches a
 * bug in main at its source instead of as an undefined field three layers away
 * in the renderer.
 *
 * A failure throws, which Electron turns into a rejected promise on the
 * renderer side carrying the message. That is the contract: a bad call is a
 * rejection the caller can read, never a crash in the main process.
 */
/**
 * What `handle` has actually registered. ipcMain keeps invoke handlers in a map
 * of its own rather than as emitter listeners, so there is nothing to ask: the
 * only honest answer is the one this module records as it registers.
 */
const registered = new Set<string>()

function handle<Request extends z.ZodType, Response extends z.ZodType>(
  channel: Channel<string, Request, Response>,
  handler: (
    request: z.infer<Request>,
    event: IpcMainInvokeEvent,
  ) => z.infer<Response> | Promise<z.infer<Response>>,
): void {
  registered.add(channel.channel)
  ipcMain.handle(channel.channel, async (event, raw: unknown) => {
    const request = channel.request.safeParse(raw)
    if (!request.success) {
      throw new Error(`${channel.channel}: ${formatIssues(request.error)}`)
    }

    const result = await handler(request.data, event)

    const response = channel.response.safeParse(result)
    if (!response.success) {
      throw new Error(
        `${channel.channel}: main produced an invalid response: ${formatIssues(response.error)}`,
      )
    }
    return response.data
  })
}

export function registerIpcHandlers(options: {
  /** Where the window's answer to a Claude Code command goes. */
  readonly answerLink: (id: string, result: LinkResult) => void
  /** The window is ready for commands, which is when the app may say it is there. */
  readonly linkListening: () => void
  /** Open a score, through the one road every source takes. */
  readonly openScore: (request: OpenRequest) => Promise<OpenResult>
  readonly recentScores: () => Promise<RecentEntry[]>
  readonly libraryScores: (query: LibraryQuery) => Promise<LibraryItem[]>
  readonly settings: SettingsStore
  readonly pack: PackDownloader
  /** Save the score a window sent as MIDI, asking where in front of that window. */
  readonly exportScore: (
    request: ExportRequest,
    window: BrowserWindow | null,
  ) => Promise<ExportResult>
  /** Keep a worked-out arrangement in the file the window has open. */
  readonly keepArrangement: (request: KeepRequest) => Promise<KeepResult>
}): void {
  handle(appInfo, () => ({
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    scoreFormatVersion: FORMAT_VERSION,
  }))

  handle(windowSetTitle, ({ title }, event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window === null) {
      throw new Error('window:set-title: the calling window is gone')
    }
    window.setTitle(title)
    return { title }
  })

  handle(packManifest, () => readPackManifest(packDirectory()))

  handle(packFile, async ({ path }) => ({ bytes: await readPackFile(packDirectory(), path) }))

  handle(linkAnswer, ({ id, result }) => {
    options.answerLink(id, result)
    return null
  })

  handle(linkListening, () => {
    options.linkListening()
    return null
  })

  handle(scoreOpen, (request) => options.openScore(request))

  handle(scoreRecent, () => options.recentScores())

  handle(libraryList, (query) => options.libraryScores(query))

  handle(settingsRead, () => options.settings.read())

  handle(settingsWrite, (patch) => options.settings.update(patch))

  handle(settingsReset, () => options.settings.reset())

  handle(packSource, () => options.pack.source())

  // Progress goes back to the window that asked, as it arrives.
  handle(packDownload, (_request, event) =>
    options.pack.download((progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(PUSH_NAMES.packProgress, progress)
      }
    }),
  )

  handle(packCancel, () => {
    options.pack.cancel()
    return null
  })

  handle(scoreExport, (request, event) =>
    options.exportScore(request, BrowserWindow.fromWebContents(event.sender)),
  )

  handle(scoreKeepArrangement, (request) => options.keepArrangement(request))
}

/**
 * Whether every declared channel actually has a handler. A channel in the
 * contract with nothing behind it fails as a rejection at runtime, months
 * later, in whichever screen happened to call it first.
 */
export function unregisteredChannels(): string[] {
  return allChannels
    .filter((channel) => !registered.has(channel.channel))
    .map((channel) => channel.channel)
}
