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
came from, and the README should say so rather than implying a public release.

### §PI64 Something to download

The plugin installs in one step and then, for anybody without the app, says to get it
from the repository's releases page, which is empty. The packaging exists:
electron-builder already produces an installer on the machine that runs it. What is
missing is the step that makes one on each platform and puts it somewhere a person can
download it, so the guidance points at something real. A tag carrying the app's version
is the natural trigger, with a workflow that builds the Windows and macOS installers on
their own runners and attaches them to a release for that tag; building on the machine
it targets is what keeps native pieces such as the MIDI stack honest. The first releases
will be unsigned, since signing is a purchase and its own line, so the release notes
have to say what the operating system will show and how to get past it rather than leave
somebody to meet it cold. The version in the tag, the app's own version and the link
version the app reports should be one decision, made once, or the message telling
somebody which side to update names a number they cannot find.

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

### §PI49 A convenience channel that is not a way in

A local endpoint that accepts a score and plays it is, described plainly, a way to make
a program on this machine do something. That is fine and it needs bounds. The listener
binds to loopback only and never to an external interface. Every request carries the
token from the handshake file, generated per app start and readable only by the current
user, so another account on a shared machine cannot drive it. Payloads are validated by
the same schema as everything else before reaching any code that acts on them. File
paths crossing the boundary are confined to the library directory rather than accepting
an arbitrary path, because a tool that saves a score anywhere is a tool that overwrites
anything. Nothing on this channel runs a command or evaluates code. Much of this landed
with the link itself: loopback only, a token per start compared in constant time, the
presence file written owner-only, and the version and schema checked before anything
acts. What is left is proving it: that the Windows file is as private as the POSIX mode
says, and that nothing ever binds wider. None of this is exotic; it is the difference
between a feature and an incident, and it costs far less now than as a retrofit after
the plugin is published.

### §PI50 The one test that proves the premise

Every other task on this roadmap can pass while the product still does not work, because
what is promised is a chain: a sentence becomes a score, the score validates, the app
opens it, the piano plays and the notes fall. So one test walks that whole chain. It
runs the plugin command against a known public-domain piece, takes the score the model
produced, validates it with the real validator, loads it into a headless instance of the
app, renders the opening bars offline and asserts the expected pitches sound at the
expected times. Model output is the one part that cannot be asserted exactly, so the
assertion is on properties that must hold: it validates, the key and meter are right,
the note count is in a sane range, and it plays. Kept in CI with a recorded model
response as the default and a live run available on demand, this is the test that fails
the day the premise breaks.

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

### §PI51 The three ways people open a file

Everyone expects the same three. Dragging a file onto the window, which in Electron
means handling the drop in the renderer and passing a path across the boundary rather
than reading it there. A file dialog reachable from a menu item and a keyboard shortcut.
And a recent list, which is the one most used after the first week and the one most
often forgotten. The operating system side matters too: double-clicking a score file
should open it here, which means registering the extension during packaging and handling
the open-file event on macOS and the command-line argument on Windows, including the
case where the app is already running. Every route goes through the same validation, so
a malformed file produces the same readable error however it arrived, shown to a person
as the expected and fix halves of each problem with the JSON paths kept out of the way.
A file that fails to open must not leave the app half-loaded with the previous score
partly replaced, which is the bug this feature is most likely to grow. Claude Code
already asks for a score by library id: the window refuses that until it can open files,
and opening one is this same route. A .mid file takes the same routes through importMidi
from the score-format package, and the lists of what it dropped and what it guessed are
shown to whoever opened it rather than swallowed.

### §PI52 A collection that stays usable as it grows

One score in a folder needs no library. Two hundred, which is roughly what a month of
asking Claude Code for pieces produces, needs an index. The library watches a directory,
reads the metadata block out of each score and keeps a small index it can search without
parsing everything on every keystroke. Listing shows title, composer, difficulty and
duration, and filters on level, tag and composer, with search covering title and
composer at minimum. The index is a cache and never the truth: the files on disk are the
truth, so a score dropped in by hand outside the app appears, and a corrupted index is
rebuilt rather than repaired. This is also what the MCP library tools read, so the same
index answers a question asked in chat and a list shown on screen. Sorting by when
something was added matters more than it sounds, because the piece somebody wants is
usually the one they just generated.

### §PI53 Asking once

A handful of things must survive a restart or the app feels amnesiac: the chosen MIDI
device, the latency calibration measured for it, the theme, the default difficulty
level, effects on or off, the lead time visible on the roll, the library location, and
the metronome and count-in preferences, and the timing window an attempt is graded
against. They live in one store in the per-user application directory, validated on read
the same way the score format is, so a corrupted or hand-edited file falls back to
defaults with a message rather than crashing at startup. Settings are versioned and
migrated for the same reason scores are, because a setting whose meaning changes
silently is worse than one that is missing. Anything sensitive, which here is
essentially the handshake token, stays out of this file and is regenerated per run
instead. The practice history is the other store, and it wants the same treatment for
the same reasons: written on every attempt, validated on read, versioned, and personal
data, so the door that hands it over and deletes it belongs beside the settings rather
than behind a clipboard. A reset to defaults is offered, because the fastest way out of
a bad audio configuration is to start over, and the alternative is somebody deleting a
file they first had to find.

### §PI54 Getting the piano onto the machine

The sample pack is too large to sit inside an installer people are expected to download
from a web page, so it arrives on first run. That download has to behave like a download
and not a hopeful fetch: resumable, verified against a checksum, cancellable, and honest
about its size before it starts. While it runs the app stays fully usable on the
synthesised engine, which is the whole reason that engine exists. A failed or cancelled
download leaves a working app rather than a broken one and can be retried later from
settings. The pack is versioned, so a later release can ship a better one without a
reinstall; npm run pack:samples builds it reproducibly as a directory whose manifest
lists every file with its size and sha256, which is what the download verifies against,
and the app tolerates holding an older pack than it would prefer. Main already reads the
installed pack from a sample-pack directory in the app's user data, or from wherever
PIANO_SAMPLE_PACK points, so the download only has to put a verified pack there. For an
offline or restricted machine there is a manual path: a documented location to drop the
pack file by hand. That is not an edge case, it is every corporate laptop the app will
ever run on.

### §PI55 Something to hear on the first launch

An app that opens empty asks the user to do work before it has proved it is worth any.
So the install carries a small set of scores, chosen deliberately rather than whatever
was to hand. They are public domain with source and licence recorded, as the non-goals
require and as the packaging check enforces. They cover the range: something simple
enough for a beginner to play within minutes, something familiar enough that a listener
recognises it and can hear whether the playback is right, and something dense enough to
put the roll and the audio engine under real load. Each ships with all three difficulty
arrangements authored by hand rather than generated, which makes them the reference for
what a good arrangement looks like and doubles them as fixtures. They are also the first
thing a new contributor listens to, so a regression in timing or dynamics is caught by
opening the app instead of by reading a test report.

### §PI58 Saving a score as MIDI

exportMidi in the score-format package already produces the bytes and the list of what a
MIDI file cannot carry, so this is surface work rather than format work. An Export as
MIDI menu item and keyboard shortcut sit beside the open routes PI51 adds. The main
process owns the save dialog and the write, as it owns every other disk access; the
renderer sends the score it is showing across a typed IPC channel rather than a path,
because the score in memory is the thing being exported. The suggested file name comes
from the title. The dropped list is shown after the write, in plain words, and never as
a blocking question: somebody taking a practice piece into a DAW does not need to
confirm that the fingerings stay behind, but should be told that they did. One choice is
left open: whether the export plays the score as written, which is what exportMidi does
today, or the arrangement currently selected, which would run resolveArrangement first
and name the level in the file name.

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
