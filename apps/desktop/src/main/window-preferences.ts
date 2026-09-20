import { join } from 'node:path'

import type { BrowserWindowConstructorOptions } from 'electron'

/**
 * The security-relevant window settings, in one named place.
 *
 * They live here rather than inline in the BrowserWindow call for two reasons.
 * A reviewer looking for "can the renderer reach Node" has one file to open,
 * and the self-check can assert on the very object the window was built from
 * instead of on a copy of it. Electron removed the accessor that used to read
 * these back off a live WebContents, so the object itself is the only honest
 * source — and the live probe in the self-check is what proves it took effect.
 */
export const secureWebPreferences = {
  preload: join(__dirname, '..', 'preload', 'preload.cjs'),
  /** The renderer gets its own world; the preload's objects are copied, not shared. */
  contextIsolation: true,
  /** No require, no process, no fs in the page. */
  nodeIntegration: false,
  /** Chromium's own sandbox on top, so a compromised renderer has no OS reach. */
  sandbox: true,
  /** Same-origin policy stays on; nothing here loads a remote origin in production. */
  webSecurity: true,
  allowRunningInsecureContent: false,
} as const satisfies BrowserWindowConstructorOptions['webPreferences']
