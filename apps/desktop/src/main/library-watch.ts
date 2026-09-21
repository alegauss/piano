import { watch } from 'node:fs'
import { mkdir } from 'node:fs/promises'

import { INDEX_FILE } from '@piano/library'

/**
 * Being told when the library folder changes.
 *
 * Claude Code saves a score while the window is open, or somebody copies one
 * into the folder by hand; either way a list on screen should show it without
 * being asked twice. The folder is made if it is not there, since there is
 * nothing to watch otherwise. A burst of changes — an editor saving through a
 * temporary file — is one piece of news, and the index being rewritten by a
 * listing is none, or every listing would ask for the next one.
 */
export async function watchLibrary(
  root: string,
  changed: () => void,
  settleMs = 250,
): Promise<() => void> {
  await mkdir(root, { recursive: true })
  let pending: NodeJS.Timeout | null = null
  const watcher = watch(root, (_event, name) => {
    if (typeof name === 'string' && name.startsWith(INDEX_FILE)) {
      return
    }
    if (pending !== null) {
      clearTimeout(pending)
    }
    pending = setTimeout(() => {
      pending = null
      changed()
    }, settleMs)
  })
  // A watch the system withdraws leaves a list that refreshes when it is opened.
  watcher.on('error', () => {})
  return () => {
    if (pending !== null) {
      clearTimeout(pending)
    }
    watcher.close()
  }
}
