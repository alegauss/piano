import { existsSync } from 'node:fs'
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
/**
 * The window's background before the renderer has painted anything.
 *
 * The one colour the main process spells out, because it needs a value before
 * any stylesheet exists and cannot read a custom property. It mirrors
 * --surface-base in the dark theme — oklch(0.18 0.012 260) converted to sRGB —
 * and the two are kept in step by hand: a mismatch shows as a flash of the
 * wrong shade while a window is opening or being resized. Everything else in
 * this app names a token instead of spelling one.
 */
export const WINDOW_BACKGROUND = '#0e1217'

/**
 * The window's icon, which only development needs.
 *
 * A packaged build takes its icon from the executable, which electron-builder
 * stamps from build/icon.png. Running from source there is no executable, so
 * the window and the taskbar show Electron's own logo instead of this app's
 * unless the window is handed the file. It is the same file either way, so
 * the two can never drift.
 *
 * Absent rather than empty when the file is not there: the icon is drawn by
 * `npm run icon` and a checkout that has not run it should open a window with
 * a default icon rather than fail to open one.
 */
export function windowIcon(): string | undefined {
  // From apps/desktop/dist/main up to the repository root, where build/ lives.
  const drawn = join(__dirname, '..', '..', '..', '..', 'build', 'icon.png')
  return existsSync(drawn) ? drawn : undefined
}

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
