# Roadmap (active backlog)

## Block A — Foundation: Electron, TypeScript, React and shadcn

- 📋 **PI57** (deps: PI6 ✅) **An unsigned build trips SmartScreen and Gatekeeper, so a new user meets a warning before the app** — Signing needs a purchased Windows certificate and an Apple developer account, which is a decision with a price rather than a line of configuration. → §PI57

## Block B — Score JSON format

## Block C — Audio engine and transport

- 📋 **PI59** (deps: PI19 ✅, PI23 ✅) **With the window hidden, Chromium may throttle the timer that wakes the scheduler, and notes then arrive late** — The app is driven from a terminal, so it plays behind another window more often than not, and a throttled wake-up misses the look-ahead. → §PI59
- 📋 **PI61** (deps: PI21 ✅, PI22 ✅) **The synthesised fallback and the recordings are not matched in loudness or onset, so the handover can be heard** — A key moves from the synthesiser to its recording mid-phrase as registers arrive, and nothing has measured the two voices against each other. → §PI61

## Block D — Piano roll and on-screen keyboard

- 📋 **PI29** (deps: PI11 ✅, PI26 ✅) **The roll has no structure: nothing shows where a bar starts or which bar is playing** — Bar lines and measure numbers derived from the time signature map give the eye something to count and practice somewhere to point. → §PI29
- 📋 **PI30** (deps: PI4 ✅, PI23 ✅) **There are no controls: playback cannot be started, scrubbed, slowed or transposed from the screen** — One transport bar carrying play, restart, loop, position, BPM, transpose and zoom is the surface the whole app is driven from. → §PI30
- 📋 **PI31** (deps: PI9 ✅, PI26 ✅) **Every part sounds and draws at once, so a learner cannot isolate one hand or one voice** — A parts panel with mute, solo, colour and visibility per part turns a recording into something that can be taken apart. → §PI31
- 📋 **PI32** (deps: PI4 ✅, PI26 ✅) **Colours are chosen ad hoc, so the roll is unreadable in one theme and ambiguous under colour blindness** — One token palette shared by the DOM and the canvas keeps both themes legible and parts distinguishable without relying on hue alone. → §PI32

## Block E — Practice mode and difficulty levels

- 📋 **PI33** (deps: PI3 ✅) **A MIDI keyboard plugged into the machine is invisible: nothing receives a single note** — Web MIDI with device discovery and hot-plug is what turns a real piano into the input device this whole block depends on. → §PI33
- 📋 **PI34** (deps: PI25 ✅) **Without a MIDI keyboard there is no way to play at all, so most people cannot try the app** — A computer keyboard mapping with octave shift makes practice reachable on any laptop, and makes the practice code testable without hardware. → §PI34
- 📋 **PI35** (deps: PI33) **Input and output latency are unknown, so a player who is in time gets graded late** — Measuring output latency and MIDI input delay once, then subtracting them, is what makes any grading fair on a given machine. → §PI35
- 📋 **PI36** (deps: PI23 ✅, PI33) **Playback runs away from a beginner, who cannot keep up and has nothing to practise against** — A wait mode that holds the score until the right keys are pressed lets a learner set the pace instead of chasing one. → §PI36
- 📋 **PI37** (deps: PI35, PI36) **Nothing says how the attempt went: wrong notes, late notes and missed notes all pass unremarked** — Grading against a timing window, with a report naming the bars that failed, is what turns playing along into practising. → §PI37
- 📋 **PI38** (deps: PI32, PI37) **The player gets no feedback: nothing on screen says which note was right, wrong or late** — Colouring the key and the note the instant it is judged puts feedback where the eye already is, rather than in a side panel. → §PI38
- 📋 **PI39** (deps: PI12 ✅) **Beginner, intermediate and advanced are only words: nothing says what changes between them** — Level presets fixing tempo, hands, voices and ornaments make the three levels a promise the app can keep for any score. → §PI39
- 📋 **PI40** (deps: PI12 ✅, PI16 ✅) **Only scores hand-authored with three arrangements are playable at beginner level** — Reducing a full score to a simpler arrangement automatically keeps every piece usable at every level without three times the authoring. → §PI40
- 📋 **PI41** (deps: PI11 ✅, PI39) **A hard bar can only be practised by replaying the whole piece and waiting for it to arrive** — Looping a passage, raising the tempo gradually and splitting the hands are the three things practice actually consists of. → §PI41
- 📋 **PI42** (deps: PI11 ✅, PI37) **Every session starts from nothing: no record of what was played, what improved or what still fails** — Progress stored per score and per section lets the app point at the bar that keeps failing instead of the user having to remember. → §PI42

## Block F — Claude Code First: MCP and plugin

- 📋 **PI43** (deps: PI2 ✅, PI15 ✅) **Claude Code cannot reach the app: there is no way to send a score or start playback** — An MCP server exposing score and transport tools is the whole premise of this being a Claude Code plugin rather than a player. → §PI43
- 📋 **PI44** (deps: PI3 ✅, PI43) **The MCP server and the app are separate processes with no way to find each other** — A discovery and handshake step is what makes a tool call reach the window the user is looking at, rather than a second silent instance. → §PI44
- 📋 **PI45** (deps: PI43) **There is no plugin: the tools only work for someone who wires an MCP server by hand** — A packaged Claude Code plugin with commands is what makes installation a single step and the whole premise reachable by anyone. → §PI45
- 📋 **PI46** (deps: PI15 ✅, PI45) **A model writing a score guesses at the format and produces files that almost validate** — A skill stating the format, the musical conventions and the common mistakes is what makes a generated score right the first time. → §PI46
- 📋 **PI47** (deps: PI15 ✅, PI43) **A rejected score comes back as a validation dump the model cannot act on** — Errors written for a repair loop, naming the field, the value and the fix, let the model correct its own output without a human. → §PI47
- 📋 **PI48** (deps: PI6 ✅, PI44) **Asking to play a piece fails whenever the app is closed, which is most of the time** — Launching or focusing the app from a tool call is what makes the request work from a chat window with nothing already open. → §PI48
- 📋 **PI49** (deps: PI44) **A local port that accepts scores and plays them is an open door on the machine** — Binding to loopback, requiring a token and allowlisting paths keep a convenience channel from becoming a way in. → §PI49
- 📋 **PI50** (deps: PI26 ✅, PI46, PI48) **Nothing proves the premise: no single run goes from a request to a piece actually playing** — One end-to-end test that asks for a piece, writes the score, validates it and plays it is the only check that this product works. → §PI50

## Block G — Score library and distribution

- 📋 **PI51** (deps: PI3 ✅, PI15 ✅) **There is no way to open a file: a score sitting on disk cannot be loaded into the app at all** — Drag and drop, a file dialog and a recent list are the three ways anyone expects to open something, and the app has none of them. → §PI51
- 📋 **PI52** (deps: PI13 ✅, PI51) **Scores pile up in a folder with no index: nothing lists, searches or filters them** — A local library reading metadata into an index is what keeps a growing collection usable and what the MCP search tool reads. → §PI52
- 📋 **PI53** (deps: PI3 ✅) **Every setting resets on restart: device, theme, calibration and level are chosen again each time** — Persisted settings in one validated store keep the app from asking the same questions at every launch. → §PI53
- 📋 **PI54** (deps: PI6 ✅, PI20 ✅) **The sample pack cannot ship inside the installer, and there is no way to fetch it** — A first-run download with resume, verification and a usable app while it runs is what makes a large sample bank practical. → §PI54
- 📋 **PI55** (deps: PI12 ✅, PI13 ✅) **A new install opens on an empty library, so there is nothing to hear and nothing to try** — A handful of bundled public-domain scores across the three levels give the app something to prove itself with on first launch. → §PI55
- 📋 **PI58** (deps: PI17 ✅, PI51) **Nothing in the app saves a score as MIDI, so the way into a DAW that the recording non-goal promises is unreachable** — exportMidi already writes the file and lists what it dropped; a menu item and a save dialog are what put it in front of somebody. → §PI58

## Done when — PI29

- **Bar lines follow a mid-piece meter change** A fixture moving from 4/4 to 3/4 draws
  bar lines at the right ticks and numbers the bars continuously across the change, with
  the pickup bar labelled correctly.
- **Dragging across bars sets a loop** Selecting a bar range directly on the roll sets
  loop points to those bar boundaries exactly, with no numeric entry and no snapping to
  the wrong beat.

## Done when — PI30

- **Controls reflect the transport, not an optimistic guess** Pause, seek and loop
  update the bar from transport state, and a seek that is clamped or rejected shows the
  position that actually took effect rather than the one requested.
- **The app is playable from the keyboard alone** Space, slower, faster, loop and
  restart all work without touching the mouse, which is what somebody with both hands on
  a piano actually needs.

## Done when — PI31

- **Mute and hide are independent per part** Hiding a hand while still hearing it, and
  hearing it while watching both, are each reachable in one click and behave
  independently of each other.
- **A mute takes effect without a click in the audio** Toggling a part mid-chord
  suppresses the next scheduled note rather than cutting one that is already sounding,
  verified on rendered output.

## Done when — PI32

- **The canvas reads its colours from the DOM tokens** Switching theme restyles the roll
  and the chrome in one pass, and no colour constant survives anywhere in the rendering
  code.
- **Parts stay distinguishable without relying on hue** Under a simulated red-green
  colour-blind filter two adjacent parts remain tellable apart, and the practice colours
  meet a measured contrast ratio against the background.

## Done when — PI33

- **A controller switched on later connects without a restart** Plugging in or powering
  a MIDI keyboard mid-session makes it available and selectable immediately, and the
  chosen device is still selected on the next launch.
- **Velocity zero is treated as note off** A controller sending note-on at velocity zero
  releases the note, verified against recorded message streams from at least two
  controllers that behave differently.

## Done when — PI34

- **An octave and a half is playable from the computer keyboard** The mapped rows sound
  the right pitches, octave shift moves the whole mapping, and the current range is
  visible on the on-screen keyboard rather than guessed.
- **Auto-repeat never produces a stream of note-ons** Holding a key sounds one note that
  sustains until release, asserted by a test over synthetic key events rather than by
  trying it by hand.

## Done when — PI35

- **Calibration produces a stable figure from a dozen strikes** Repeating the
  measurement on the same hardware lands within a few milliseconds of the previous
  result, and the median absorbs one deliberately mistimed strike.
- **The measured offset is subtracted before grading** A recorded input stream shifted
  by a known delay grades identically to one with no delay once the calibration for that
  device is applied.

## Done when — PI36

- **The score waits for a chord and resumes cleanly** Playback holds until every note of
  the chord is struck inside the grouping window, then continues from that note without
  replaying it or jumping the accompaniment.
- **Extra notes while waiting never block** Pressing wrong keys during a hold is
  recorded for the report but does not prevent the correct notes from releasing it.

## Done when — PI37

- **A dropped note does not cascade into wrong notes** A recorded attempt missing one
  note grades that note as missed and every following note as correct, rather than
  shifting the whole sequence by one position.
- **The report names bars, not a percentage** A session ends with accuracy per bar and
  per named section, so the worst passage is identifiable without interpreting a single
  overall number.

## Done when — PI38

- **Judgement appears on the key and the note, not a panel** Expected, correct, wrong
  and missed each have a visible state on the keyboard and on the roll, and a missed
  note stays visible instead of silently vanishing.
- **Feedback fires on the judgement event** A test over a fake clock shows the visual
  state changing at the judged timestamp rather than waiting for the next frame
  boundary.

## Done when — PI39

- **Each level names a concrete value for every knob** Tempo fraction, hands, voices,
  ornaments, chord reduction, wait mode and timing window each have a stated value per
  level, readable from one place rather than inferred.
- **Every knob stays adjustable after choosing a level** Selecting beginner and then
  widening one setting keeps the rest of the preset intact and records the customised
  level alongside the progress.

## Done when — PI40

- **A full score reduces to something recognisable** Reducing a reference piece keeps
  the melody identifiable, checked against a fixture whose expected output was reviewed
  by a person rather than generated by the same code.
- **A hand-authored arrangement wins over the generated one** A score declaring its own
  beginner arrangement uses it unchanged, and the generator neither overwrites it nor
  merges into it.

## Done when — PI41

- **Loop, progressive tempo and hands separate compose** Left hand only, bars 17 to 20,
  starting at half tempo and stepping up on each clean pass, works as one configured
  drill rather than three settings fought separately.
- **Tempo drops back on a failed repetition** A repetition graded below the threshold
  lowers the speed to the previous step instead of continuing to climb away from the
  player.

## Done when — PI42

- **History survives a score being re-saved** Progress keyed on score and section ids
  stays attached after the file is rewritten or its title is changed, rather than being
  orphaned by a path.
- **Practice data can be exported and deleted** One action exports the whole local store
  and one deletes it with nothing left behind, which is what the local-only non-goal
  requires in practice.

## Done when — PI43

- **Every tool is usable from a cold read of its description** In a scripted evaluation
  a model with no other context calls each tool correctly on the first attempt, and no
  tool needs the source read to be understood.
- **The server validates with the same code as the app** A score the MCP tool accepts
  opens in the app, and one either rejects is rejected by both, asserted across the
  whole malformed fixture set.

## Done when — PI44

- **A tool call reaches the window the user is looking at** With two windows open,
  playback starts in the most recently focused one, and a stale handshake file left by a
  crash is detected rather than connected to.
- **A version mismatch fails with a readable message** An older plugin meeting a newer
  app reports what is incompatible and what to update, instead of connecting and then
  behaving strangely.

## Done when — PI45

- **Installing the plugin is a single step** A fresh Claude Code install adds the plugin
  and its tools and commands become available with no hand-edited configuration file
  anywhere.
- **A missing app gives install guidance, not a socket error** Running a command with
  the desktop app not installed explains how to install it, rather than reporting a
  failed connection the user cannot interpret.

## Done when — PI46

- **A score written from the skill validates first time** Across a scripted evaluation
  over several pieces the generated JSON passes the validator with no repair round in
  the large majority of runs.
- **The skill names the mistakes a schema cannot catch** Overlapping voices, hands
  crossed by accident, chord spans no hand reaches and a beginner arrangement identical
  to the advanced one are each called out with an example.

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

## Done when — Block D

- **What is seen and what is heard are the same event** The roll holds 60fps on the
  densest fixture while its position stays locked to the audio clock, in both themes and
  with effects on.

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
