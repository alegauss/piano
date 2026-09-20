# Shipped Ledger

## Block A — Foundation: Electron, TypeScript, React and shadcn

- ✅ **PI1** **There is no application: nothing opens a window, nothing compiles and there is no way to run it** — The app builds and runs: npm run dev opens an Electron window with React reloading, and tsc -b typechecks main, preload, renderer and the build scripts.
  checked **npm run dev opens a window running the React app** On a clean clone after install the window appears, the renderer hot-reloads on an edit to a component, and main restarts on an edit to a main-process file.
  checked **Typecheck passes across main, preload and renderer** One command runs tsc against all three tsconfigs in strict mode and exits zero, with no implicit any and no file excluded to make it pass.
- ✅ **PI2** **The score format has to run inside the app and inside the MCP server, with no duplicated code** — The score format lives in one package that the desktop app and the MCP server both import, and a guard plus one typecheck prove neither keeps a second copy.
  checked **App and MCP server import the same format package** No score type is declared outside packages/score-format, and both consumers resolve it through the workspace rather than a relative path into another app.
  checked **A breaking format change fails both builds in one run** Removing a field from the package makes the desktop app and the MCP server fail typecheck in the same CI job, rather than one of them failing months later at runtime.

## Block B — Score JSON format

## Block C — Audio engine and transport

## Block D — Piano roll and on-screen keyboard

## Block E — Practice mode and difficulty levels

## Block F — Claude Code First: MCP and plugin

## Block G — Score library and distribution

