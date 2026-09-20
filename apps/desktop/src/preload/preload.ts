import { contextBridge } from 'electron'

/**
 * The only bridge between the renderer and the system.
 *
 * It carries the runtime versions and nothing else, which is enough to prove
 * all three processes are wired together. PI3 replaces this with a typed IPC
 * contract shared with main, and every channel added here from then on is
 * named by intent rather than by capability.
 */
const bridge = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
} as const

export type PianoBridge = typeof bridge

contextBridge.exposeInMainWorld('piano', bridge)
