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
- ✅ **PI60** **The format-ownership guard reads a split "type Score," import line as a declaration and fails the lint** — The ownership guard now matches a Score type only where a declaration follows the name, so a split import passes and a local declaration still fails.

## Block B — Score JSON format

- ✅ **PI7** **There is no time model: nothing says where a note starts, and seconds break the moment tempo changes** — Positions are integer ticks converted through one tempo map, so a mid-piece tempo change lands on its bar and halving the tempo moves nothing.
  checked **A mid-piece tempo change plays at the right bar** A fixture whose tempo doubles at bar 9 is scheduled from the tempo map, and asserted note onset times match computed values to within a millisecond on both sides of the change.
  checked **Halving the tempo moves no note relative to the bar** Playing at 50 percent leaves every note on the same tick and in the same bar; only the tick-to-seconds conversion changes, proven by a test over that function alone.
- ✅ **PI8** **There is no note model: pitch, length, dynamics, hand and fingering have nowhere to live** — A note carries pitch, spelling, tick length, velocity, voice, hand and finger through a round trip, and one voice overlapping itself is named as an error.
  checked **A note round-trips with hand, voice and fingering intact** Parsing and reserialising a fixture preserves pitch, spelling, start, duration, velocity, voice, hand and finger, with no field quietly replaced by a default.
  checked **Overlapping same-pitch notes in one voice are rejected** The validator names both note ids, the pitch and the tick where they overlap, instead of leaving the engine to resolve an ambiguous note-off at playback time.
- ✅ **PI9** **A score is one flat list of notes, so the parts panel has nothing to mute, solo or colour** — Notes group into named parts that can be muted, soloed or filtered by hand, and a score declaring no parts gets one implicit part and plays.
  checked **Notes group into parts and a part can be silenced** A fixture with two parts loads, and muting one removes its notes from both playback and the roll while the other continues unchanged.
  checked **A score declaring no parts still loads and plays** The loader assigns one implicit part which the panel shows, and no validation error is raised for the missing part table.
- ✅ **PI10** **Sustain pedal, dynamics and articulation are unrepresented, so playback sounds mechanical** — Pedal is a timed event covering everything between down and up, and dynamics multiply written velocity so an accent stays above its neighbours through a crescendo.
  checked **A pedal held across a bar line is one event, not a per-note flag** The fixture carries two control events, down and up; playback sustains every note between them, and the note objects themselves carry no pedal field at all.
  checked **Dynamics multiply written velocity rather than replacing it** A fixture with an accent inside a crescendo keeps the accent measurable: the accented note stays above its neighbours at every point along the ramp.
- ✅ **PI11** **There is no way to name a passage, so nobody can ask to play the chorus or bars 12 to 20** — A passage has a stable id that resolves to a tick range, and a bar range resolves through the time signature map to exactly the same ticks.
  checked **A section id resolves to a tick range and can be looped** Selecting a named section sets the loop points exactly at its start and end ticks, and passing the same id to the transport produces the same range.
  checked **A bar range resolves through the time signature map** Asking for bars 12 to 20 in a score with a mid-piece meter change returns the tick range a human counting bar lines on the roll would point at.
- ✅ **PI12** **Nothing in the format says what beginner, intermediate and advanced mean for a given piece** — Three levels resolve from one note set as filters and overrides, so correcting a wrong note in the source corrects every level without a per-level edit.
  checked **One note source produces three levels without copying notes** The fixture declares one note list and three arrangements; resolving each yields a different playable note list, and no note appears twice anywhere in the file.
  checked **Fixing a wrong note corrects every level at once** Editing one note in the source changes what all three arrangements resolve to, asserted by a test that follows the shared note id into each resolved output.
- ✅ **PI13** **A score carries no title, composer, key or licence, so the library has nothing to list or filter** — Every score carries title, composer, level, tags and provenance, so a library can search and sort it and a packaging check can refuse an unlicensed one.
  checked **A bundled score names a public-domain source and licence** The packaging step refuses a build where any score under the bundled library has an empty provenance block, and the failure names the offending file.
  checked **The library filters on difficulty, composer and tags** Metadata read from the file populates the list view, and filtering by level word and by tag returns exactly the expected subset of a fixture library.
- ✅ **PI14** **The format has no version, so a file written today stops opening the moment a field changes** — Every score declares a version that a migration chain walks forward, and a field the format does not define is an error naming the nearest real one.
  checked **A version 1 fixture opens in the current app** Frozen files from every historical version load through the migration chain, and each resolves to the same score the current writer would produce from the same music.
  checked **An unknown key outside extensions is an error** The validator rejects a misspelled field by name rather than ignoring it, while the same key placed under extensions survives a round trip untouched.
- ✅ **PI15** **Nothing validates a score, so a malformed file fails somewhere deep inside the audio engine** — One zod schema produces the types, the runtime validator and the published JSON Schema, and a bad score is refused at the door naming the path and the value.
  checked **The generated JSON Schema matches the zod schema** CI regenerates it and fails when the checked-in file differs, so the document a model reads is never behind the validator the app actually runs.
  checked **Errors name the path, the value and the expectation** Each malformed fixture produces a message a model can act on: a JSON pointer to the field, the value that arrived and what was required instead.
- ✅ **PI16** **There are no reference scores, so nothing proves a format change kept old files readable** — Sixteen reference scores cover the hard cases, each round-trips identically after normalisation, and a checksum stops a frozen fixture being edited to suit its own migration.
  checked **Every fixture round-trips identically after normalisation** Parsing and reserialising each reference score returns the input, which is the check that catches a field silently dropped by a refactor of the loader.
  checked **Frozen per-version fixtures are never edited** A test asserts a checksum over each historical fixture, so a migration can never be made to pass by quietly changing the file it exists to migrate.
- ✅ **PI17** **The format exchanges with nothing: MIDI files cannot come in and no score can go out** — importMidi reads a MIDI file into a valid score and exportMidi writes one; both list what they dropped, and import marks what it guessed (design recorded in `packages/score-format/src/midi.ts`).
  checked **Export reports what it dropped** Exporting a score carrying fingering, articulation and arrangements lists each thing MIDI cannot represent, instead of writing a file that silently lost them.

## Block C — Audio engine and transport

- ✅ **PI18** **There is no way to produce sound, and no seam between the engine and everything that drives it** — PianoEngine fronts a synthesised and a sampled engine that swap mid-piece, and lint keeps Web Audio inside renderer/audio (design recorded in `apps/desktop/src/renderer/audio/engine.ts`).
  checked **Two engines satisfy one interface and swap at runtime** A test drives the same fixture through the synthesised engine and the sampled engine using identical calls, and nothing above the interface changes between the two runs.
  checked **No code above the audio layer touches a Web Audio node** A lint rule finds no AudioContext, oscillator or buffer source outside the engine package, so the seam is enforced rather than merely intended in a document.
- ✅ **PI19** **Notes scheduled from timers drift audibly: timing wanders and chords stop landing together** — A look-ahead scheduler stamps each event with its exact audio time; chords share one time and late wake-ups miss no onset (design recorded in `apps/desktop/src/renderer/audio/scheduler.ts`).
  checked **Scheduled onsets stay within a few milliseconds of target** Driving the scheduler over a fake clock across a hundred bars asserts every note scheduled inside tolerance, including under a simulated main-thread stall.
  checked **A chord lands as a single event** Every note of a chord is scheduled at an identical audio time, asserted exactly rather than within a window, because a spread chord is the defect a listener notices first.
  checked **The scheduler is tested against a fake clock** Scheduler tests advance a synthetic time source and assert note ordering and offsets deterministically, with no real timers, no sleeps and no audible output.

## Block D — Piano roll and on-screen keyboard

## Block E — Practice mode and difficulty levels

## Block F — Claude Code First: MCP and plugin

## Block G — Score library and distribution

