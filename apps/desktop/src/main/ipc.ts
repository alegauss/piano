import { allChannels, appInfo, formatIssues, windowSetTitle, type Channel } from '@piano/ipc'
import { FORMAT_VERSION } from '@piano/score-format'
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'

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

export function registerIpcHandlers(): void {
  handle(appInfo, () => ({
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
