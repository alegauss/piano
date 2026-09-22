# Roadmap (active backlog)

## Block A — Foundation: Electron, TypeScript, React and shadcn

- 📋 **PI57** (deps: PI6 ✅) (requires: accounts) **An unsigned build trips SmartScreen and Gatekeeper, so a new user meets a warning before the app** — Signing needs a purchased Windows certificate and an Apple developer account, which is a decision with a price rather than a line of configuration. → §PI57

## Block B — Score JSON format

## Block C — Audio engine and transport

## Block E — Practice mode and difficulty levels

## Block F — Claude Code First: MCP and plugin

## Block G — Score library and distribution

- 📋 **PI103** (deps: PI101 ✅, PI102 ✅) **Practice history is keyed by a score's id or, where it has none, its title: renaming a piece starts its record over** — An edit gives a piece a stable id, its records follow the rename, and a deletion says what becomes of them. → §PI103
- 📋 **PI104** (deps: PI100 ✅, PI101 ✅) **Claude Code can write a score into the library but never remove one, nor correct what one says without rewriting it** — delete_score and a metadata update go through the library package the window edits with, so chat and panel keep one set of rules. → §PI104
- 📋 **PI105** (deps: PI100 ✅, PI101 ✅) **Tidying a library that grew by the batch means opening, confirming and closing one row at a time** — Rows can be picked in the panel and then deleted or tagged together, with one question asked of the whole selection. → §PI105
- 📋 **PI106** (deps: PI102 ✅) **Open recent names a piece by the title it had when it was opened, so a corrected one is listed under its old name** — The list is written from what the file says now, so correcting a piece changes what every way into it calls it. → §PI106

## Block H — Sheet music view

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
