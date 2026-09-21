import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  APP_RECORD,
  needsWindow,
  PRESENCE_DIRECTORY,
  PUSH_NAMES,
  type AppRecord,
  type OpenResult,
  type RecentEntry,
  type Settings,
} from '@piano/ipc'
import { createLibrary, nodeFiles } from '@piano/library'
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  session,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron'

import { BUNDLED_SCORES } from './bundled'
import { createHistoryStore } from './history-store'
import { saveHistory } from './history-save'
import { registerIpcHandlers } from './ipc'
import { keepInFile } from './keep-arrangement'
import { watchLibrary } from './library-watch'
import { startLinkHost, type LinkHost } from './link-host'
import { createRelay } from './link-relay'
import { menuTemplate } from './menu'
import { createOpener } from './opener'
import { createPackDownloader, packSourceUrl } from './pack-download'
import { createRecent } from './recent'
import { packDirectory } from './sample-pack'
import { createSettingsStore } from './settings-store'
import { exportScore } from './score-export'
import { launchPath, libraryItem, libraryRoot, openScoreFile } from './score-files'
import { applyContentSecurityPolicy, applyPermissions, confineNavigation } from './security'
import {
  secureWebPreferences,
  timingWebPreferences,
  WINDOW_BACKGROUND,
  windowIcon,
} from './window-preferences'

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

/**
 * One app at a time. A second launch — a double-click on a running app, or a
 * tool call racing another — hands over to the first and quits, so there is
 * never a second window for a tool call to reach instead of the one in front
 * of the person. The lock is per profile, which keeps a dev run and a smoke
 * run, each with its own, out of each other's way.
 */
const firstInstance = app.requestSingleInstanceLock()
if (!firstInstance) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

/** Bring the window to the front, which is what somebody who just asked for music expects. */
function raise(window: BrowserWindow): void {
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
}

/**
 * Where Claude Code's requests are relayed: to the window, which is where
 * playback lives, and back again with what it made of them. A command that
 * makes a sound or a change raises the window on the way; asking what is
 * open does not.
 */
const relay = createRelay((message) => {
  const window = mainWindow
  if (window === null || window.isDestroyed()) {
    return false
  }
  if (needsWindow(message.command)) {
    raise(window)
  }
  window.webContents.send(PUSH_NAMES.linkCommand, message)
  return true
})

let linkHost: LinkHost | null = null
let listening = false

/** The scores opened lately, kept in this profile. */
const recent = createRecent(join(app.getPath('userData'), 'recent-scores.json'))

/** The library Claude Code saves into, read through the same index its tools read. */
const library = createLibrary(libraryRoot(), nodeFiles)

/** What the app remembers between launches, in this profile. */
const settings = createSettingsStore(join(app.getPath('userData'), 'settings.json'))

/** Every attempt that has been graded, in this profile and nowhere else. */
const history = createHistoryStore(join(app.getPath('userData'), 'practice-history.json'))

/** The sample pack, fetched into wherever the app reads one from. */
const pack = createPackDownloader({ base: packSourceUrl(), directory: packDirectory() })

/**
 * What the app was started to open, held until the window asks for it: a
 * score pushed before the page is listening would be opened and lost.
 */
let launchFile: string | null = launchPath(process.argv, process.cwd())

/**
 * What this run was started to open, kept after `launchFile` has been taken.
 *
 * A headless run started with a score says which one it opened, and that line
 * is the only way anything outside the app can tell that a launch argument
 * survived being installed: a registry entry can name the piano and hand it a
 * path the piano then refuses.
 */
const startedWith = launchFile

/** Resolves with the name of the first score this run opens. */
let scoreOpened: (name: string) => void = () => {}
const openedScore = new Promise<string>((resolve) => {
  scoreOpened = resolve
})

/** Whether the renderer got as far as loading, which tells two timeouts apart. */
let rendererLoaded = false

/** Whether the window has asked, after which a score opened from outside is sent straight to it. */
let windowAsked = false

/** The file the window's score was last opened from, which a keep writes into; none at first. */
let openFile: string | null = null

const opener = createOpener({
  read: openScoreFile,
  recent,
  choose: chooseScoreFile,
  libraryRoot: () => libraryRoot(),
  launched: () => {
    const file = launchFile
    launchFile = null
    return file
  },
  remembered: (entries, opened) => {
    app.addRecentDocument(opened.path)
    setMenu(entries)
  },
  opened: (path) => {
    openFile = path
    scoreOpened(basename(path))
  },
})

async function chooseScoreFile(): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: 'Open a score',
    properties: ['openFile'],
    filters: [
      { name: 'Scores and MIDI files', extensions: ['piano', 'json', 'mid', 'midi'] },
      { name: 'All files', extensions: ['*'] },
    ],
  }
  const window = mainWindow
  const chosen =
    window === null || window.isDestroyed()
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(window, options)
  return chosen.canceled ? null : (chosen.filePaths[0] ?? null)
}

/**
 * Open a score for the window from outside the page — the menu, the file
 * manager, a second launch — and bring the window forward with the outcome,
 * a refusal included: somebody who asked for a file is owed an answer.
 */
async function openForWindow(open: () => Promise<OpenResult>): Promise<void> {
  const result = await open()
  const window = mainWindow
  if (result.kind === 'none' || window === null || window.isDestroyed()) {
    return
  }
  raise(window)
  window.webContents.send(PUSH_NAMES.scoreOpened, result)
}

/** A file named from outside: sent to the window once it is listening, held for it until then. */
function openFromOutside(path: string): void {
  if (!windowAsked) {
    launchFile = path
    return
  }
  void openForWindow(() => opener.openPath(path))
}

function setMenu(entries: readonly RecentEntry[]): void {
  const template = menuTemplate(process.platform, entries, {
    open: () => {
      void openForWindow(() => opener.open({ from: 'dialog' }))
    },
    openRecent: (path) => {
      void openForWindow(() => opener.open({ from: 'recent', path }))
    },
    clearRecent: () => {
      void recent.clear().then(() => {
        app.clearRecentDocuments()
        setMenu([])
      })
    },
    // The score is the window's, at the level it is playing, so the window is
    // asked to send it rather than main saving what it last opened.
    exportMidi: () => {
      if (mainWindow !== null && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(PUSH_NAMES.exportRequested)
      }
    },
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** Where running apps leave word of themselves for the MCP server. */
function presenceDirectory(): string {
  const named = process.env['PIANO_PRESENCE_DIR']
  return named !== undefined && named !== '' ? named : join(homedir(), ...PRESENCE_DIRECTORY)
}

/**
 * Listen for Claude Code, once the window says it can hear. Not in a headless
 * run: a smoke run that advertised itself would be a window a tool call could
 * find and nobody could see.
 */
async function listenForClaude(): Promise<void> {
  if (isSmokeRun || isSelfCheckRun || listening) {
    return
  }
  listening = true
  try {
    linkHost = await startLinkHost({
      directory: presenceDirectory(),
      pid: process.pid,
      app: app.getVersion(),
      send: relay.relay,
    })
  } catch (error: unknown) {
    // The piano works without Claude Code; it should say so, not refuse to start.
    process.stderr.write(`piano: not listening for Claude Code: ${String(error)}\n`)
  }
}

/**
 * Say where this installed app lives, so a tool call with no window open can
 * start this one. Only a packaged app says so: a development checkout is
 * somebody working on the piano, not somebody who installed it.
 */
async function recordInstallation(): Promise<void> {
  if (!app.isPackaged || isSmokeRun || isSelfCheckRun) {
    return
  }
  const record: AppRecord = { executable: appLocation(), version: app.getVersion() }
  const file = join(homedir(), ...APP_RECORD)
  try {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, `${JSON.stringify(record)}\n`, 'utf8')
  } catch (error: unknown) {
    process.stderr.write(`piano: could not record where the app is: ${String(error)}\n`)
  }
}

/** The thing to start: the executable, or on macOS the application bundle around it. */
function appLocation(): string {
  const executable = app.getPath('exe')
  const bundle = executable.indexOf('.app/Contents/MacOS/')
  return process.platform === 'darwin' && bundle >= 0
    ? executable.slice(0, bundle + '.app'.length)
    : executable
}

function createWindow(theme: Settings['theme']): void {
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
    webPreferences: { ...secureWebPreferences, ...timingWebPreferences },
  })

  confineNavigation(mainWindow, devServerUrl, pathToFileURL(rendererPage()).href)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // The window somebody last looked at is the one a tool call reaches, so
  // being focused is news the MCP server has to be able to read.
  mainWindow.on('focus', () => {
    void linkHost?.focused()
  })

  if (isSmokeRun || isSelfCheckRun) {
    armHeadlessRun(mainWindow)
  }

  // The theme travels with the page, so the first paint is already in it
  // rather than dark for a moment before the settings arrive.
  if (devServerUrl !== undefined && devServerUrl !== '') {
    const url = new URL(devServerUrl)
    url.searchParams.set('theme', theme)
    void mainWindow.loadURL(url.href)
  } else {
    void mainWindow.loadFile(rendererPage(), { query: { theme } })
  }
}

/** The page the window shows when the renderer was built to disk. */
function rendererPage(): string {
  return join(__dirname, '..', 'renderer', 'index.html')
}

function armHeadlessRun(window: BrowserWindow): void {
  window.webContents.once('did-finish-load', () => {
    void (async () => {
      rendererLoaded = true
      process.stdout.write('piano: renderer loaded\n')

      if (!isSelfCheckRun) {
        // Started with a score, this run waits to say which one it opened.
        // The window asks main for it after the page has loaded, so quitting
        // here would report on a launch argument nobody had looked at yet.
        if (startedWith !== null) {
          process.stdout.write(`piano: opened ${await openedScore}\n`)
        }
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
    process.stderr.write(
      rendererLoaded
        ? `piano: ${startedWith ?? 'the score it was started with'} was never opened\n`
        : 'piano: the renderer did not load in time\n',
    )
    app.exit(1)
  }, HEADLESS_TIMEOUT_MS).unref()
}

// A second launch lands here instead of opening another window, and a file it
// was started to open — a double-click in the file manager — opens in this one.
app.on('second-instance', (_event, commandLine, workingDirectory) => {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    raise(mainWindow)
  }
  const path = launchPath(commandLine, workingDirectory)
  if (path !== null) {
    openFromOutside(path)
  }
})

// macOS hands a file over as an event rather than an argument, and can do so
// before the app is ready, which is why it is listened for from the start.
app.on('open-file', (event, path) => {
  event.preventDefault()
  openFromOutside(path)
})

if (firstInstance) {
  app
    .whenReady()
    .then(async () => {
      applyContentSecurityPolicy(session.defaultSession, devServerUrl)
      applyPermissions(session.defaultSession)
      registerIpcHandlers({
        answerLink: relay.answer,
        linkListening: () => {
          void listenForClaude()
        },
        openScore: (request) => {
          // The window asking for what it was launched with is the window
          // listening, so anything opened from outside after this is sent.
          if (request.from === 'launch') {
            windowAsked = true
          }
          return opener.open(request)
        },
        recentScores: () => recent.list(),
        libraryScores: async ({ order, ...filter }) =>
          (await library.search(filter, order)).map(libraryItem),
        settings,
        history,
        saveHistory: async (window) =>
          saveHistory(await history.held(), {
            choose: async (suggested) => {
              const options: SaveDialogOptions = {
                title: 'Save the practice history',
                defaultPath: join(app.getPath('documents'), suggested),
                filters: [{ name: 'JSON files', extensions: ['json'] }],
              }
              const chosen =
                window === null
                  ? await dialog.showSaveDialog(options)
                  : await dialog.showSaveDialog(window, options)
              return chosen.canceled || chosen.filePath === '' ? null : chosen.filePath
            },
            write: (path, text) => writeFile(path, text, 'utf8'),
          }),
        pack,
        exportScore: (request, window) =>
          exportScore(request, {
            choose: async (suggested) => {
              const options: SaveDialogOptions = {
                title: 'Save as MIDI',
                defaultPath: join(app.getPath('documents'), suggested),
                filters: [{ name: 'MIDI files', extensions: ['mid'] }],
              }
              const chosen =
                window === null
                  ? await dialog.showSaveDialog(options)
                  : await dialog.showSaveDialog(window, options)
              return chosen.canceled || chosen.filePath === '' ? null : chosen.filePath
            },
            write: (path, bytes) => writeFile(path, bytes),
          }),
        keepArrangement: (request) => keepInFile(openFile, request.arrangement),
      })

      setMenu([])
      void recent.list().then(setMenu)
      const theme = async () => (await settings.read()).settings.theme
      createWindow(await theme())
      if (!isSmokeRun && !isSelfCheckRun) {
        // A first launch finds something to play in the library, once.
        void library.seed(BUNDLED_SCORES).catch((error: unknown) => {
          process.stderr.write(`piano: the bundled scores were not added: ${String(error)}\n`)
        })
        void watchLibrary(library.root, () => {
          if (mainWindow !== null && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(PUSH_NAMES.libraryChanged)
          }
        }).catch((error: unknown) => {
          process.stderr.write(`piano: not watching the library: ${String(error)}\n`)
        })
      }
      void recordInstallation()

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          void theme().then(createWindow)
        }
      })
    })
    .catch((error: unknown) => {
      process.stderr.write(`piano: failed to start: ${String(error)}\n`)
      app.exit(1)
    })
}

// The presence file goes with the app, so the next tool call is told there is
// no window rather than being sent to one that is gone.
app.on('will-quit', () => {
  void linkHost?.close()
  linkHost = null
})

app.on('window-all-closed', () => {
  // macOS keeps the app alive with no windows; everywhere else this is the exit.
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
