# Improvements

## Block A — Foundation: Electron, TypeScript, React and shadcn

### §PI57 Signing, and what it costs

electron-builder is already configured around this: the win and mac blocks name where an
identity would go, and both are deliberately left empty rather than half-filled, because
a half-configured signing step fails at the end of a long build instead of at the start.
What is missing is not configuration. Windows wants a code signing certificate from a
recognised authority, which costs money every year and, in the EV form that clears
SmartScreen immediately, arrives on a hardware token no CI runner can hold without a
signing service in front of it. macOS wants an Apple Developer account, an
application-specific password and a notarisation step that uploads each build to Apple
and waits for an answer. Both are purchases and both need someone to hold an account, so
neither belongs inside a task that could otherwise be finished. The consequence of
leaving it is concrete and worth writing down: on Windows a first-time user sees a blue
panel naming an unknown publisher, and on macOS the app refuses to open until they
right-click and confirm. Somebody who wanted to try a piano does neither. Until this is
done the honest position is that the installers are for people who were told where they
came from, and the README should say so rather than implying a public release. It does
not cross "User accounts, cloud storage or sync across machines": these are the
publisher's signing accounts, and nobody who plays the piano ever has one.

### §PI64 Something to download

The plugin installs in one step and then, for anybody without the app, says to get it
from the repository's releases page, which is empty. The packaging exists:
electron-builder already produces an installer on the machine that runs it. What is
missing is the step that makes one on each platform and puts it somewhere a person can
download it, so the guidance points at something real. The sample pack is published too,
as the folder npm run pack:samples builds, from somewhere that serves it as a folder,
since release assets are flat; and PUBLISHED_PACK in the app's pack-download module is
set to where it lands, which is what turns the first-run download on. A tag carrying the
app's version is the natural trigger, with a workflow that builds the Windows and macOS
installers on their own runners and attaches them to a release for that tag; building on
the machine it targets is what keeps native pieces such as the MIDI stack honest. The
first releases will be unsigned, since signing is a purchase and its own line, so the
release notes have to say what the operating system will show and how to get past it
rather than leave somebody to meet it cold. The version in the tag, the app's own
version and the link version the app reports should be one decision, made once, or the
message telling somebody which side to update names a number they cannot find.

## Block B — Score JSON format

## Block C — Audio engine and transport

### §PI59 Playing behind another window

The scheduler wakes on setInterval every 25 milliseconds and looks 100 ahead, so any
wake-up later than about 75 milliseconds costs a note its onset. Chromium throttles
timers in a page that is hidden or occluded, down to about one wake-up a second, and
this app is driven from a terminal, so it spends most of its playing life behind another
window. Chromium exempts a page that is audibly playing from part of that throttling,
but not the silent stretch before the first note or a rest long enough for the page to
count as quiet, and the exemption is not something to build on without measuring it.
Measure first: a live test that minimises the window, starts the scheduler against a
recording engine and checks that no wake-up gap exceeds the look-ahead. The expected fix
is backgroundThrottling set to false in the window's web preferences, kept beside
secureWebPreferences rather than inside it, since it is about timing and not trust. If
that proves insufficient, the wake-up moves to a Worker, whose timers the page's
visibility does not govern, posting to the scheduler instead of calling it.

### §PI61 One instrument across the handover

A key plays synthesised until its register arrives and recorded afterwards, often within
one phrase, so the two have to sound like one instrument at the level of loudness and
onset even though they cannot in timbre. Today they are set independently: the
synthesised voice peaks at a fixed fraction of full scale, while a recording plays at
the level the pack normalised it to, with the velocity gain applied on top of a layer
that already carries its own loudness. Nothing has measured the two against each other.
Measure first: render middle C at a few velocities through both voices offline and
compare loudness over the first half second, with the real pack in a development run and
a stand-in recording of known level in the test suite. Then calibrate the synthesised
voice to the pack rather than the other way round, since the recordings are the
reference, and carry the calibration in the manifest if packs differ. The onset matters
as much: the recordings keep three milliseconds before the hammer, and the synthesised
attack should land at the same point.

## Block E — Practice mode and difficulty levels

### §PI62 Timing error as a shape

The colour says a note was not in time; it does not say by how much or which way, and
those are different problems. Somebody consistently twenty milliseconds early is not
making mistakes, they are playing to a different beat, and the answer is one sentence
rather than another hour of practice. The figure is already measured: the grader keeps a
signed offset on every verdict, in seconds a player feels, and the report prints it.
What is missing is the drawing. A mark on the note at the distance from the strike line
the error puts it reads as a shape, which is the point: a whole passage struck a little
to one side is a bias, where a scatter either side of the line is ordinary human timing.
It belongs on the roll, where the eye already is, and it is drawn the way the notes are,
batched into a path per frame rather than a stroke per note. The hard part is the
geometry rather than the arithmetic. A note being judged is at the strike line by
definition, so a mark placed at its head is off the field the instant it matters; it
needs somewhere to live that is still visible a moment later, and it has to stay legible
on a note three pixels tall.

## Block F — Claude Code First: MCP and plugin

### §PI65 Warnings for music that validates

The skill lists the mistakes that pass validation and still make a bad score, and asks
the model to read its own work against the list before saving. That is a request, and a
request is what a model skips when it is sure of itself. Three of the seven are
arithmetic rather than taste, so the format package can check them: the left hand's
highest note against the right hand's lowest in each bar, the span of what one hand
strikes at once, and whether each hand's notes and gaps fill the bar the meter says.
They come back as warnings beside a valid result, never as refusals, because each one
has a legitimate exception — hands do cross, and a rest is a gap nobody wrote down — and
a validator that refuses music it does not understand teaches the model to write around
it. A warning names the bar and the notes, in the same shape the repair loop already
reads, so a model can decide in one step whether the warning is the music or a mistake.
The other four stay in the skill, because a melody's range and a beginner version being
easier enough are judgements, not sums. The warnings live in score-format beside
validation, so the app can show the same ones to somebody opening a file.

## Block G — Score library and distribution

### §PI63 Keeping the proposal

The rules hand back an arrangement, which is the whole point of deriving one rather than
filtering notes on the fly: it names the notes it left out, so a person or Claude Code
can read it, argue with it and correct one line of it. None of that is reachable while
it lives for the length of a session. The reduction is worked out again on every launch,
and a correction has nowhere to go, so the proposal is offered and then quietly thrown
away. Writing it into the score file under its own id is what closes that: a score that
carries a generated arrangement is a score whose beginner version somebody can fix once
and keep, and the rules stop being consulted for it at all, since a hand-authored
arrangement already wins. The write is an ordinary save through whatever opens a file,
with the arrangement marked as generated so a later run can tell one it produced from
one somebody wrote, and so re-deriving it after the source changes replaces its own work
and never a person's. The question this leaves open is what should happen when the notes
it named have since been edited: naming a note that is no longer there is already a
validation error, so the choice is between dropping the stale arrangement and
re-deriving it, and that is a judgement about whose work is worth more rather than
something the code can settle.

### §PI66 A file type the system can hand to the piano

The app already opens whatever the system hands it: the file on its command line at
launch, the one a second launch passes to the running window, and the macOS open-file
event, early or late. What is missing is the system knowing to hand it over, and that is
blocked on a name rather than on code. Scores are saved as `name.score.json`, and
neither Windows nor macOS registers a double extension: a claim on `.score.json` is a
claim on every `.json` somebody has, which no piano app should make. So the choice comes
first. A single extension of the app's own, such as `.piano`, holding the same JSON, is
the one that can be registered honestly; the library then writes it, reads both suffixes
while old files remain, and the MCP server and the app keep sharing the one naming
function in the IPC package. MIDI is different: `.mid` belongs to whatever the person
already uses, so the piano should appear under Open With and never become the default,
which is `rank: Alternate` on macOS and an OpenWithProgids entry rather than a default
verb on Windows. The Linux AppImage gets a desktop entry and a MIME type with the same
split. Done when a score double-clicked in the file manager opens in the piano, and a
MIDI file offers it without taking it over.

### §PI67 The practice history, kept like the settings

The practice history is written on every attempt and read at every launch, and it is the
one record in the app about a person rather than a piece. Today it sits in the
renderer's browser storage as JSON nobody validates: a record from a damaged store is
cast rather than checked, there is no version to migrate from, and nothing in the app
hands it over or deletes it. It wants the settings' treatment. Main keeps it in its own
file in the app's profile, written whole through a temporary file; each record is
validated on read, and one that fails is dropped and counted rather than taking the rest
down with it; the file carries a version, and the first launch moves what browser
storage held into it, as the settings did. Beside the reset in the footer go two plain
doors: save the history as a file somebody can keep, and delete it after asking. Neither
crosses a non-goal. "Audio recording or export to WAV or MP3" is about sound, and this
exports records of attempts as JSON. "User accounts, cloud storage or sync across
machines" is about leaving the machine, and this file stays in the local profile unless
its owner carries it somewhere. Done when the history survives a restart from the file,
a damaged record costs only itself, and both doors work.
