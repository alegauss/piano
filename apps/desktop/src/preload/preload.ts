import type { LinkCommandPush, OpenResult, PackProgressPush, PianoBridge } from '@piano/ipc'
import { CHANNEL_NAMES, PUSH_NAMES } from '@piano/ipc/names'
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'

/**
 * ipcRenderer.invoke is typed as Promise<any>, because it cannot know what is
 * on the other end. The cast is to the contract's own type, and main parses
 * every response against that same schema before it leaves, so the shape is
 * checked by the side that produced it rather than asserted by this one.
 */
async function invoke<Result>(channel: string, payload: unknown): Promise<Result> {
  return (await ipcRenderer.invoke(channel, payload)) as Result
}

/**
 * The only bridge between the renderer and the system.
 *
 * It forwards named intents and does nothing else: no file access, no module
 * loading, no way to reach a capability that is not spelled out here. Adding a
 * method means adding a channel to the contract and a validated handler in
 * main, which is three files a reviewer sees rather than one line nobody does.
 *
 * Nothing is validated on this side. Main parses every request on arrival and
 * every response on the way out, and duplicating that here would put the
 * schema library inside the trust boundary to re-check what has already been
 * checked by the side that does not trust the caller.
 */
const bridge: PianoBridge = {
  appInfo: async () => invoke(CHANNEL_NAMES.appInfo, null),
  setWindowTitle: async (request) => invoke(CHANNEL_NAMES.windowSetTitle, request),
  packManifest: async () => invoke(CHANNEL_NAMES.packManifest, null),
  packFile: async (request) => invoke(CHANNEL_NAMES.packFile, request),
  // The event itself stays on this side: it carries the sender, which is a
  // handle on main the renderer has no business holding. Subscribing is what
  // listening means, so it is also what tells main the window is ready: the
  // app is announced to Claude Code only once a command would be heard.
  onLinkCommand: (listener) => {
    const forward = (_event: IpcRendererEvent, push: LinkCommandPush) => {
      listener(push)
    }
    ipcRenderer.on(PUSH_NAMES.linkCommand, forward)
    void invoke(CHANNEL_NAMES.linkListening, null)
    return () => {
      ipcRenderer.removeListener(PUSH_NAMES.linkCommand, forward)
    }
  },
  answerLinkCommand: async (answer) => invoke(CHANNEL_NAMES.linkAnswer, answer),
  openScore: async (request) => invoke(CHANNEL_NAMES.scoreOpen, request),
  // The path is asked of Electron here, from the File itself. A page can make
  // a File out of nothing, but only one somebody dropped has a path, so this
  // door opens what a person dropped and nothing a script names.
  openDroppedFile: async (file) => {
    let path = ''
    try {
      path = webUtils.getPathForFile(file as File)
    } catch {
      // Not a File at all, which is a page trying something rather than a drop.
    }
    if (path === '') {
      const { name } = file as { readonly name?: unknown }
      return {
        kind: 'refused',
        name: typeof name === 'string' ? name : 'that',
        message: 'Only a file dropped from the computer can be opened this way.',
        problems: [],
      }
    }
    return invoke(CHANNEL_NAMES.scoreOpen, { from: 'dropped', path })
  },
  recentScores: async () => invoke(CHANNEL_NAMES.scoreRecent, null),
  libraryScores: async (query) => invoke(CHANNEL_NAMES.libraryList, query),
  readSettings: async () => invoke(CHANNEL_NAMES.settingsRead, null),
  writeSettings: async (patch) => invoke(CHANNEL_NAMES.settingsWrite, patch),
  resetSettings: async () => invoke(CHANNEL_NAMES.settingsReset, null),
  packSource: async () => invoke(CHANNEL_NAMES.packSource, null),
  downloadPack: async () => invoke(CHANNEL_NAMES.packDownload, null),
  cancelPackDownload: async () => invoke(CHANNEL_NAMES.packCancel, null),
  onPackProgress: (listener) => {
    const forward = (_event: IpcRendererEvent, progress: PackProgressPush) => {
      listener(progress)
    }
    ipcRenderer.on(PUSH_NAMES.packProgress, forward)
    return () => {
      ipcRenderer.removeListener(PUSH_NAMES.packProgress, forward)
    }
  },
  onLibraryChanged: (listener) => {
    const forward = () => {
      listener()
    }
    ipcRenderer.on(PUSH_NAMES.libraryChanged, forward)
    return () => {
      ipcRenderer.removeListener(PUSH_NAMES.libraryChanged, forward)
    }
  },
  onScoreOpened: (listener) => {
    const forward = (_event: IpcRendererEvent, result: OpenResult) => {
      listener(result)
    }
    ipcRenderer.on(PUSH_NAMES.scoreOpened, forward)
    return () => {
      ipcRenderer.removeListener(PUSH_NAMES.scoreOpened, forward)
    }
  },
}

contextBridge.exposeInMainWorld('piano', bridge)
