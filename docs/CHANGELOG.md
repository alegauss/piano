# Shipped Ledger

## Block A — Foundation: Electron, TypeScript, React and shadcn

- ✅ **PI1** **There is no application: nothing opens a window, nothing compiles and there is no way to run it** — The app builds and runs: npm run dev opens an Electron window with React reloading, and tsc -b typechecks main, preload, renderer and the build scripts.
  checked **npm run dev opens a window running the React app** On a clean clone after install the window appears, the renderer hot-reloads on an edit to a component, and main restarts on an edit to a main-process file.
  checked **Typecheck passes across main, preload and renderer** One command runs tsc against all three tsconfigs in strict mode and exits zero, with no implicit any and no file excluded to make it pass.
- ✅ **PI2** **The score format has to run inside the app and inside the MCP server, with no duplicated code** — The score format lives in one package that the desktop app and the MCP server both import, and a guard plus one typecheck prove neither keeps a second copy.
  checked **App and MCP server import the same format package** No score type is declared outside packages/score-format, and both consumers resolve it through the workspace rather than a relative path into another app.
  checked **A breaking format change fails both builds in one run** Removing a field from the package makes the desktop app and the MCP server fail typecheck in the same CI job, rather than one of them failing months later at runtime.
- ✅ **PI56** **npm run dev opens two identical windows, and an edit to main spawns another instead of replacing it** — npm run dev opens one window and an edit to main replaces that process rather than adding a second, with dev and smoke runs on separate Electron profiles.
  checked **One edit to a main-process file restarts exactly one process** The main Electron process, the one with no --type= switch, is replaced one for one; a rebuild that touches both esbuild contexts still produces a single restart.
  checked **A dev run and a smoke run never share a profile directory** Each passes its own userData path, so neither fills the log with cache access-denied errors nor disturbs the installed app's profile.
- ✅ **PI3** **The renderer can reach Node and the file system, and IPC messages carry no type** — The renderer reaches nothing but a named bridge, and every IPC channel is declared once and parsed on arrival in main, proven by a self-check inside a live Electron.
  checked **The renderer cannot reach require, process or fs** All three evaluate to undefined in a production build, and a test reads the BrowserWindow options back to assert contextIsolation on, sandbox on and nodeIntegration off.
  checked **Every IPC channel has a shared type and validates on arrival** Each handler in main parses its payload before use; a test sends a malformed payload on every channel and gets a rejected promise carrying a readable error, not a thrown exception.
- ✅ **PI4** **There is no design system: every screen would invent its own colour, spacing and components** — Tailwind and shadcn components render under a dark and a light theme, and every colour resolves to one token file that the React chrome and the canvas both read.
  checked **shadcn components render correctly under both themes** A demo route shows button, slider, dialog, popover, switch and select, and toggling the theme restyles all of them without a reload or a flash of the wrong colours.
  checked **No component hardcodes a colour** A grep over the renderer finds no hex literal outside the token definition file, and the piano roll canvas reads its note and bar colours from those same tokens.
- ✅ **PI5** **Nothing checks the code: with no tests, no lint and no gate, a regression only shows up while playing** — Typecheck, lint and 35 tests run from one command, split so the fast half takes under a second and the half that starts Electron or a browser is a gate.
  checked **CI fails on a type error, a lint error or a failing test** A branch carrying one of each turns the job red, and the same three checks run locally through a single script so the gate is reproducible before pushing.
  checked **Layout claims are tested in a real browser, not jsdom** A test about a measured size, scroll or focus order runs in headless Chromium through Playwright, because jsdom lays nothing out and would let the test assert a number it invented.
  checked **The live suite refuses to run against a stale bundle** A global setup compares the built output against the source tree and fails rather than reporting green about code nobody is looking at.
- ✅ **PI6** **There is no installer: the app only runs in development mode, on the machine that built it** — One command produces a 107 MB Windows installer whose packaged app starts and passes all twelve self-checks, with a CI matrix for macOS and Linux beside it.
  checked **An installer is produced for Windows, macOS and Linux** One CI job builds NSIS, dmg and AppImage artifacts from the same electron-builder configuration, and each is downloadable from the run.
  checked **The packaged app runs with no development dependency present** Installed on a clean machine the window opens and a bundled score plays, with no Node runtime, no dev server and no source checkout available to it.

## Block B — Score JSON format

## Block C — Audio engine and transport

## Block D — Piano roll and on-screen keyboard

## Block E — Practice mode and difficulty levels

## Block F — Claude Code First: MCP and plugin

## Block G — Score library and distribution

