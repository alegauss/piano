# Contributing

Thanks for looking. This file is what you need to change Piano and know the change is sound.

## Running it

Node 20.11 or later (CI uses 24).

```
npm ci
npm run dev
```

`npm run dev` builds the app and starts Electron on a profile of its own, rebuilding and
restarting as you edit.

## Where things are

| Path                    | What                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| `apps/desktop`          | The Electron app: `src/main` (Node), `src/preload`, `src/renderer` (React) |
| `apps/mcp-server`       | The MCP server the plugin runs; `src/tools.ts` is the tool registry        |
| `packages/score-format` | The score format, its only owner: schema, validation, MIDI and MusicXML    |
| `packages/ipc`          | The named channels between the renderer and main                           |
| `packages/library`      | The score library on disk                                                  |
| `packages/sample-pack`  | Builds the recorded piano from its pinned sources                          |
| `plugin/`               | The Claude Code plugin: commands, the score skill, the bundled server      |
| `scores/`               | Example scores, original and CC0                                           |
| `site/`                 | The public site, a standalone workspace ([site/README.md](site/README.md)) |
| `docs/`                 | The roadmap, the changelog and the design notes, kept by roadkeep          |

## The checks

```
npm run check      # typecheck, lint and the fast tests: what CI runs first
npm run test:live  # the browser and Electron tests, after npm run build
```

`npm run lint` is more than ESLint and Prettier. It also runs the repository's own rules, each
of which exists because the mistake it refuses is easy to make and expensive to find:

- **One owner for the score format.** No score type is declared outside
  `packages/score-format`, and nothing reaches into it by relative path.
- **One file spells a colour.** In the renderer, only `styles/tokens.css` may write a colour
  literal; the canvas and the DOM read the same tokens.
- **The schema is current.** `npm run schema` regenerates it from the zod source.
- **The plugin's bundled server is current.** `npm run plugin` rebuilds `plugin/server/`.
- **One version.** The root `package.json`, the app, the server and the plugin manifest agree.

The renderer is sandboxed: it imports no Node builtin and nothing from `main` or `preload`.
What it needs from the system goes through a channel in `packages/ipc`, and only
`src/renderer/audio` touches Web Audio.

## The backlog

`docs/ROADMAP.md`, `docs/CHANGELOG.md` and `docs/IMPROVEMENTS.md` are governed by
roadkeep: edit them through its CLI, not by hand, and its lint runs in CI on every push. A task is shipped with `roadkeep ship`, which updates all three
at once.

## The site

`site/` is its own Node workspace and is not part of `npm ci` at the root:

```
cd site
npm ci
npm run dev
npm run build && npm test
```

The site states nothing about the product it cannot read from this repository: tool and
command names, the version, the levels and whether there is a release are generated on every
build. If you rename a tool, the build tells you which page mentions it.

## Commits and pull requests

Keep a change to one thing, and say in the message why it is needed, not only what it does.
Run `npm run check` before you push; CI runs it, the live tests and, on `main`, the installers
for all three systems.
