import type { LinkCommandPush, PianoBridge } from '@piano/ipc'
import { CHANNEL_NAMES, PUSH_NAMES } from '@piano/ipc/names'
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

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
  // handle on main the renderer has no business holding.
  onLinkCommand: (listener) => {
    const forward = (_event: IpcRendererEvent, push: LinkCommandPush) => {
      listener(push)
    }
    ipcRenderer.on(PUSH_NAMES.linkCommand, forward)
    return () => {
      ipcRenderer.removeListener(PUSH_NAMES.linkCommand, forward)
    }
  },
  answerLinkCommand: async (answer) => invoke(CHANNEL_NAMES.linkAnswer, answer),
}

contextBridge.exposeInMainWorld('piano', bridge)
