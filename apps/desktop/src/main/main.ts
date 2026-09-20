import { join } from 'node:path'

import { app, BrowserWindow, shell } from 'electron'

/**
 * Set by scripts/dev.mjs. Present means the renderer is served by Vite; absent
 * means it was built to disk and is loaded from there.
 */
const devServerUrl = process.env['VITE_DEV_SERVER_URL']

/**
 * Smoke mode loads the renderer once, reports it and exits. It is how the app
 * is checked without a human looking at a window.
 */
const isSmokeRun = process.env['PIANO_SMOKE'] === '1'

const SMOKE_TIMEOUT_MS = 60_000

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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    title: 'Piano',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'preload.cjs'),
      // The renderer holds no privilege. PI3 turns these into something a test
      // asserts rather than something a reviewer has to notice.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Anything that tries to open a window goes to the real browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (isSmokeRun) {
    mainWindow.webContents.once('did-finish-load', () => {
      process.stdout.write('piano: renderer loaded\n')
      app.quit()
    })
    setTimeout(() => {
      process.stderr.write('piano: renderer did not load within the smoke timeout\n')
      app.exit(1)
    }, SMOKE_TIMEOUT_MS).unref()
  }

  if (devServerUrl !== undefined && devServerUrl !== '') {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '..', 'renderer', 'index.html'))
  }
}

app
  .whenReady()
  .then(() => {
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
