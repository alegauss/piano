import { join } from 'node:path'

import { app, BrowserWindow, session } from 'electron'

import { registerIpcHandlers } from './ipc'
import { applyContentSecurityPolicy, applyPermissions, confineNavigation } from './security'
import { secureWebPreferences, WINDOW_BACKGROUND, windowIcon } from './window-preferences'

/**
 * Set by scripts/dev.mjs. Present means the renderer is served by Vite; absent
 * means it was built to disk and is loaded from there.
 */
const devServerUrl = process.env['VITE_DEV_SERVER_URL']

/** Load the renderer once, report it and exit: how the app is checked without a human. */
const isSmokeRun = process.env['PIANO_SMOKE'] === '1'

/** The same, but running the isolation and IPC assertions before it exits. */
const isSelfCheckRun = process.env['PIANO_SELFCHECK'] === '1'

const HEADLESS_TIMEOUT_MS = 60_000

/**
 * A dev run and a smoke run each pass their own profile directory. Two Electron
 * processes sharing one userData directory fight over the disk cache, and the
 * loser fills the log with "Unable to move the cache: access denied" while
 * behaving oddly in ways nobody connects back to the cause.
 */
const userDataDir = process.env['PIANO_USER_DATA_DIR']
if (userDataDir !== undefined && userDataDir !== '') {
  app.setPath('userData', userDataDir)
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const icon = windowIcon()
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: WINDOW_BACKGROUND,
    autoHideMenuBar: true,
    title: 'Piano',
    // Development has no executable to take an icon from, so the window is
    // given the same file electron-builder stamps into the packaged one.
    ...(icon === undefined ? {} : { icon }),
    // The renderer holds no privilege; window-preferences.ts says exactly how,
    // and the self-check asserts both that object and what the live page can
    // actually reach.
    webPreferences: secureWebPreferences,
  })

  confineNavigation(mainWindow, devServerUrl)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (isSmokeRun || isSelfCheckRun) {
    armHeadlessRun(mainWindow)
  }

  if (devServerUrl !== undefined && devServerUrl !== '') {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '..', 'renderer', 'index.html'))
  }
}

function armHeadlessRun(window: BrowserWindow): void {
  window.webContents.once('did-finish-load', () => {
    void (async () => {
      process.stdout.write('piano: renderer loaded\n')

      if (!isSelfCheckRun) {
        app.quit()
        return
      }

      try {
        // Imported here so the ordinary path never loads the check code.
        const { runSelfCheck, captureThemes } = await import('./selfcheck')
        const results = await runSelfCheck(window)

        const shotDir = process.env['PIANO_SCREENSHOT_DIR']
        if (shotDir !== undefined && shotDir !== '') {
          for (const file of await captureThemes(window, shotDir)) {
            process.stdout.write(`piano: captured ${file}\n`)
          }
        }
        for (const result of results) {
          process.stdout.write(
            `${result.ok ? 'pass' : 'FAIL'}  ${result.name}  (${result.detail})\n`,
          )
        }
        const failed = results.filter((result) => !result.ok).length
        process.stdout.write(
          `piano: self-check ${String(results.length - failed)}/${String(results.length)} passed\n`,
        )
        app.exit(failed === 0 ? 0 : 1)
      } catch (error: unknown) {
        process.stderr.write(`piano: self-check crashed: ${String(error)}\n`)
        app.exit(1)
      }
    })()
  })

  setTimeout(() => {
    process.stderr.write('piano: the renderer did not load in time\n')
    app.exit(1)
  }, HEADLESS_TIMEOUT_MS).unref()
}

app
  .whenReady()
  .then(() => {
    applyContentSecurityPolicy(session.defaultSession, devServerUrl)
    applyPermissions(session.defaultSession)
    registerIpcHandlers()

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
  .catch((error: unknown) => {
    process.stderr.write(`piano: failed to start: ${String(error)}\n`)
    app.exit(1)
  })

app.on('window-all-closed', () => {
  // macOS keeps the app alive with no windows; everywhere else this is the exit.
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
