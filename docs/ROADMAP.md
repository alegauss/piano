# Roadmap (active backlog)

## Block A — Foundation: Electron, TypeScript, React and shadcn

- 📋 **PI57** (deps: PI6 ✅) **An unsigned build trips SmartScreen and Gatekeeper, so a new user meets a warning before the app** — Signing needs a purchased Windows certificate and an Apple developer account, which is a decision with a price rather than a line of configuration. → §PI57
- 📋 **PI64** (deps: PI6 ✅, PI45 ✅) **Nothing is published to download: the plugin sends a person without the app to an empty releases page** — Installers built per platform from a version tag and attached to a release are what make the plugin's install guidance point at something real. → §PI64

## Block B — Score JSON format

## Block C — Audio engine and transport

- 📋 **PI59** (deps: PI19 ✅, PI23 ✅) **With the window hidden, Chromium may throttle the timer that wakes the scheduler, and notes then arrive late** — The app is driven from a terminal, so it plays behind another window more often than not, and a throttled wake-up misses the look-ahead. → §PI59
- 📋 **PI61** (deps: PI21 ✅, PI22 ✅) **The synthesised fallback and the recordings are not matched in loudness or onset, so the handover can be heard** — A key moves from the synthesiser to its recording mid-phrase as registers arrive, and nothing has measured the two voices against each other. → §PI61

## Block E — Practice mode and difficulty levels

- 📋 **PI62** (deps: PI38 ✅) **The roll says a note was late but not by how much, so a player who is always a hair early cannot see it** — A consistent bias is a shape on the roll rather than a word, and seeing it is what makes somebody fix it instead of guessing. → §PI62

## Block F — Claude Code First: MCP and plugin

- 📋 **PI47** (deps: PI15 ✅, PI43 ✅) **A rejected score comes back as a validation dump the model cannot act on** — Errors written for a repair loop, naming the field, the value and the fix, let the model correct its own output without a human. → §PI47
- 📋 **PI48** (deps: PI6 ✅, PI44 ✅) **Asking to play a piece fails whenever the app is closed, which is most of the time** — Launching or focusing the app from a tool call is what makes the request work from a chat window with nothing already open. → §PI48
- 📋 **PI49** (deps: PI44 ✅) **A local port that accepts scores and plays them is an open door on the machine** — Binding to loopback, requiring a token and allowlisting paths keep a convenience channel from becoming a way in. → §PI49
- 📋 **PI50** (deps: PI26 ✅, PI46 ✅, PI48) **Nothing proves the premise: no single run goes from a request to a piece actually playing** — One end-to-end test that asks for a piece, writes the score, validates it and plays it is the only check that this product works. → §PI50
- 📋 **PI65** (deps: PI46 ✅) **validate_score passes a score with the left hand above the right, a chord no hand can reach, or a bar half full** — The arithmetic half of the skill's list, returned as warnings beside a valid result, is what a model acts on when it would skip rereading. → §PI65

## Block G — Score library and distribution

- 📋 **PI51** (deps: PI3 ✅, PI15 ✅) **There is no way to open a file: a score sitting on disk cannot be loaded into the app at all** — Drag and drop, a file dialog and a recent list are the three ways anyone expects to open something, and the app has none of them. → §PI51
- 📋 **PI52** (deps: PI13 ✅, PI51) **Scores pile up in a folder with no index: nothing lists, searches or filters them** — A local library reading metadata into an index is what keeps a growing collection usable and what the MCP search tool reads. → §PI52
- 📋 **PI53** (deps: PI3 ✅) **Every setting resets on restart: device, theme, calibration and level are chosen again each time** — Persisted settings in one validated store keep the app from asking the same questions at every launch. → §PI53
- 📋 **PI54** (deps: PI6 ✅, PI20 ✅) **The sample pack cannot ship inside the installer, and there is no way to fetch it** — A first-run download with resume, verification and a usable app while it runs is what makes a large sample bank practical. → §PI54
- 📋 **PI55** (deps: PI12 ✅, PI13 ✅) **A new install opens on an empty library, so there is nothing to hear and nothing to try** — A handful of bundled public-domain scores across the three levels give the app something to prove itself with on first launch. → §PI55
- 📋 **PI58** (deps: PI17 ✅, PI51) **Nothing in the app saves a score as MIDI, so the way into a DAW that the recording non-goal promises is unreachable** — exportMidi already writes the file and lists what it dropped; a menu item and a save dialog are what put it in front of somebody. → §PI58
- 📋 **PI63** (deps: PI51) **A worked-out arrangement lives for one session: it is derived again at every launch and a correction has nowhere to go** — Writing the proposal into the score is what makes it reviewable rather than a fact the app reasserts every time it starts. → §PI63

## Done when — PI47

- **Errors carry path, value, expectation and where possible the fix** Every malformed
  fixture returns a structured error holding those fields, and a retry driven only by
  that structure converges without a human reading anything.
- **Output stays bounded on a badly broken score** A score with hundreds of problems
  returns a handful grouped by kind with a count of the rest, rather than one line per
  problem.

## Done when — PI48

- **A play request with the app closed starts it and plays** From a cold machine the
  tool launches the app, waits for the handshake and begins playback, with a timeout and
  a clear failure when it cannot.
- **No second instance is ever started** A tool call arriving while the app is running
  reuses it and raises the existing window, rather than opening a duplicate that plays
  out of sight.

## Done when — PI49

- **The endpoint is unreachable from another machine or user** It binds loopback only,
  and a request without the current session token is refused, tested from a second
  account on the same machine.
- **A score cannot be written outside the library directory** A save tool handed a path
  that escapes the library is refused by name, including through relative traversal and
  through a symlink.

## Done when — PI50

- **One run goes from a request to an audible piece** The end-to-end test asks for a
  named public-domain piece and asserts the expected pitches sound at the expected times
  in an offline render.
- **The chain is gated in CI without a live model** A recorded model response is the
  default path so every push is checked, with a live run available on demand for when
  the prompt itself changes.

## Done when — PI51

- **All three open routes reach the same validation** Drag and drop, the file dialog and
  the recent list each produce the identical readable error on a malformed score, with
  no route bypassing the validator.
- **A failed open leaves the previous score intact** Opening a bad file keeps the
  currently loaded score playable, rather than leaving the app stranded half-way between
  the two.

## Done when — PI52

- **A score added outside the app appears in the library** Dropping a file into the
  watched directory lists it without a restart, because the index is a cache and the
  files on disk are the truth.
- **A corrupted index rebuilds rather than failing** Deleting or damaging the index
  makes the app rebuild it from the directory, with no score lost and no manual repair
  step asked of the user.

## Done when — PI53

- **Device, calibration, theme and level survive a restart** Choosing each one, closing
  the app and reopening it returns the same state with none of those questions asked a
  second time.
- **A corrupted settings file falls back to defaults** A hand-broken store starts the
  app on defaults with a message, rather than crashing before the window ever appears.

## Done when — PI54

- **An interrupted download resumes and verifies** Killing the transfer part-way and
  restarting continues rather than beginning again, and a corrupted file fails its
  checksum instead of being installed.
- **The app stays fully usable while the pack downloads** Playback works on the
  synthesised engine throughout, and cancelling leaves a working app that can retry
  later from settings.

## Done when — PI55

- **Every bundled score names a public-domain source** The packaging check refuses a
  build where any bundled score carries an empty provenance block, and each licence is
  visible somewhere in the app.
- **Each bundled score carries three authored arrangements** Beginner, intermediate and
  advanced are written by hand rather than generated, and each is playable end to end at
  its own level.

## Done when — Block A

- **The app runs, is typed end to end, and ships as an installer** A clean clone builds,
  typechecks, lints and tests green, and CI produces an installer for all three
  platforms that opens a window on a machine with no toolchain installed.

## Done when — Block B

- **A score survives a format change without being rewritten** Every historical fixture
  opens through the migration chain, the generated JSON Schema matches the validator it
  was derived from, and a round trip loses no field.

## Done when — Block C

- **A score plays with accurate timing and a convincing piano** Scheduled onsets hold
  their tolerance under load, velocity layers and pedal behave as written, and the first
  note sounds before the sample pack has finished loading.

## Done when — Block E

- **A learner can practise a passage and be told how it went** Playing on MIDI or the
  computer keyboard at a chosen level, with wait mode and a bar loop, produces a per-bar
  report that is fair once latency is calibrated.

## Done when — Block F

- **A sentence in Claude Code makes a piano play** The plugin installs in one step,
  generates a valid score, launches or reaches the running app and starts playback,
  gated end to end in CI on every push.

## Done when — Block G

- **A fresh install has something to play within minutes** The installer opens on a
  library with bundled scores, fetches the sample pack in the background while remaining
  usable, and remembers every choice on the next launch.

## Done when — PI57

- **A fresh Windows install shows no unknown-publisher warning** Installing the signed
  build on a machine that has never seen it opens the app without SmartScreen
  interrupting, checked on a clean virtual machine rather than on the build host.
- **The macOS build opens without a right-click** A notarised and stapled dmg opens by
  double-clicking on a machine that downloaded it, with Gatekeeper satisfied offline.
- **CI signs without a certificate in the repository** The signing material reaches the
  runner through secrets or a signing service, and nothing secret is committed, which is
  what makes this safe to automate at all.

## Non-goals

- **Staff notation editor** The screen is a piano roll: notes falling onto 88 keys.
  Drawing and editing a stave is a different product with a different layout engine, and
  it would compete with MuseScore for no gain.
- **Audio recording or export to WAV or MP3** The product plays and teaches in real
  time. Offline rendering needs a second signal path and a second class of failures;
  anyone who wants audio can export MIDI and open a DAW.
- **User accounts, cloud storage or sync across machines** Library, progress and
  settings live on local disk. A server means authentication, custody of somebody's
  practice data and a monthly bill, and it improves nothing about the act of playing.
- **Instruments other than piano** The JSON format keeps an instrument field so the
  future stays open, but the app ships one piano sample bank. Drums and strings change
  articulation, key mapping and the whole interface at once.
- **Detecting notes from a microphone or an acoustic piano** Input is MIDI or the
  computer keyboard, both deterministic. Audio transcription is a research problem in
  itself, and its false positives destroy a learner's trust in the feedback.
- **Transcribing MP3, YouTube or PDF sheet music into JSON** Producing the score is
  Claude Code's job, written from what it already knows about the piece. Automatic
  transcription is a separate project and does not belong on this roadmap.
- **Shipping copyrighted scores** The bundled library carries public domain only, with
  source and licence recorded per score. What the user generates locally is their
  problem; what the installer carries is ours.
- **A web or mobile version** Electron desktop is the target: MIDI access, disk access
  and a sample bank of several hundred megabytes. A browser or a phone would change
  audio, storage and the plugin model all at once.
