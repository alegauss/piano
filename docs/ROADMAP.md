# Roadmap (active backlog)

## Block A — Foundation: Electron, TypeScript, React and shadcn

- 📋 **PI57** (deps: visibility VS58, PI6 ✅) **An unsigned Windows build trips SmartScreen, so a new user meets a warning before the app** — The Store signs the MSIX itself in place of a certificate, and claude-tray tests that path first, so this follows what it learns. → §PI57
- 💭 **PI114** (deps: —) (requires: accounts) **An unsigned macOS build is stopped by Gatekeeper until the user right-clicks and confirms** — Notarisation needs a paid Apple developer account, a decision with a price that the Store does not answer for macOS. → §PI114

## Block B — Score JSON format

## Block C — Audio engine and transport

## Block E — Practice mode and difficulty levels

## Block F — Claude Code First: MCP and plugin

## Block G — Score library and distribution

## Block H — Sheet music view

## Block I — Public site

- 📋 **PI112** (deps: —) **Someone learning the piano reads first about Claude Code, a tool they do not use, on both the README and the site** — The author confirmed the main audience is the learner, and the two audiences barely overlap, so the first line has to choose. → §PI112
- 📋 **PI113** (deps: —) **GitHub shows the licence as Other, so directories and readers cannot tell the project is MIT** — Third-party notes appended to LICENSE stop GitHub from matching the MIT text, on a project whose selling point is being free. → §PI113

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

- **A fresh Windows install shows no unknown-publisher warning** Installing from the
  Store on a machine that has never seen the app opens it without SmartScreen
  interrupting, checked on a clean virtual machine rather than on the build host.
- **A MIDI keyboard plays in the Store build** The packaged app still reaches a
  connected keyboard through Web MIDI and reads the library in ~/.piano/library, which
  is what a learner installs it for.

## Done when — PI114

- **The macOS build opens without a right-click** A notarised and stapled dmg opens by
  double-clicking on a machine that downloaded it, with Gatekeeper satisfied offline.
- **CI signs without a secret in the repository** The Apple credentials reach the runner
  through secrets, and nothing secret is committed, which is what makes this safe to
  automate at all.

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
