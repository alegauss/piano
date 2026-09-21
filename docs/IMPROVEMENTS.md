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

### §PI36 Letting the learner set the pace

The single most useful practice feature is also the simplest: the score does not advance
until the correct notes have been played. The transport reaches the next note event and
stops, the expected keys light up, and playback resumes the moment they are struck. A
chord requires all of its notes within a short grouping window, so they do not have to
be exactly simultaneous. Getting the resume right is what makes it feel good: playback
continues from the note just played rather than replaying the event, and the
accompaniment, meaning any part the learner is not playing, keeps its relative position
instead of jumping. Extra notes played while waiting are noted but never block, because
a beginner exploring the keyboard is not committing an error. Wait mode composes with
the parts panel, so waiting on the right hand while the left plays through is the
ordinary way to use it. It is off while listening, and the grader observes the same code
path, so there is exactly one notion of a correct note.

### §PI37 Saying how it went, in a way that helps

Playing along without judgement is entertainment; practice needs to know what went
wrong. Each expected note is matched against what arrived inside a timing window, and
that window is a setting because a beginner and an advanced player want different
strictness. Four outcomes are recorded: correct, outside the window early or late, wrong
pitch, and missed entirely, with notes played that are not in the score as a fifth. The
difficult part is matching rather than scoring. A player who drops one note must not
have every following note counted wrong through a cascade, so matching runs against a
moving window and is allowed to skip rather than shifting the whole sequence by one. The
report is per bar and per named section instead of a single percentage, because a number
tells nobody what to do next while bars 17 to 20 failed four attempts out of five does.
Velocity is graded only where the input can express it, and dynamic accuracy is reported
apart from note accuracy, since they are different skills. Nothing played during the
count-in is matched or scored: the transport's isCountIn(time) says where the piece
begins. Both sides of every comparison go through PI35's arithmetic first, heardAt for
the note and struckAt for the strike, since the window is meaningless against times the
machine's own lag has already moved.

### §PI38 Feedback where the eye already is

The learner is watching notes fall and keys light up, so that is where judgement has to
appear, not in a panel off to the side. A key lights in the expected colour before its
note is due, turns to the correct colour when it is struck in time and to the wrong
colour when it is not, and the note on the roll takes the same treatment as it crosses
the strike line. Missed notes are left visibly unplayed rather than silently vanishing,
which is how somebody notices they keep dropping the same one. Timing error can be shown
as a small offset drawn on the note rather than a word, since a consistent early or late
bias is more useful seen as a shape than read as a label. These colours come from the
same token palette as everything else and they carry meaning, so they are the ones
checked for contrast and colour blindness. Feedback fires on the judgement event and
never on the draw loop, for the same reason the particles do.

### §PI39 What the three levels actually promise

Beginner, intermediate and advanced have to mean something specific or they are
decoration. A level is a named preset over concrete knobs: tempo as a fraction of
written, which hands are played against which are accompanied, how many voices are kept,
whether ornaments and grace notes are included, whether chords are reduced toward root
and a third, whether wait mode is on by default, and how wide the timing window is.
Beginner means the melody in one hand at around two thirds tempo, wait mode on, a
generous window and simplified chords. Advanced means the score as written, both hands,
no waiting and a tight window. Intermediate sits between them and its definition is
written down rather than assumed. The presets are defaults and not a cage: every knob
stays adjustable, because somebody advanced in the left hand and a beginner in the right
is an ordinary person rather than an edge case. The level a score was practised at is
recorded alongside the progress, or the history means nothing later.

### §PI40 Generating the simple version

The format allows three arrangements per score, but writing three by hand for every
piece is a cost that will quietly stop being paid, and then beginner mode works only for
the handful of scores somebody curated. So reduction is automatic, with a hand-authored
arrangement overriding it wherever one exists. The transformation is a set of rules
applied in order: keep the melodic top voice, reduce chords to a root and one interval,
drop ornaments and grace notes, thin a repeated accompaniment figure to one note per
beat, and fold anything beyond a reachable span into a single bass note. Each rule is
separately testable against fixtures, which matters because the failure mode here is a
reduction that is technically simpler and musically unrecognisable. The result is
offered as a proposal the user or Claude Code can adjust rather than as a fact, and it
is stored as an arrangement inside the score so it stays reviewable and correctable.
Reduction never edits the source notes.

### §PI41 The three things practice actually is

Practice is not playing a piece from beginning to end. It is looping four bars until
they stop failing, playing them slowly and speeding up, and taking the hands apart. All
three exist here. The loop is set from a bar drag or a named section and repeats with a
short gap, optionally with a count-in on each pass. Progressive tempo raises the speed
by a chosen step after every clean repetition and drops back on a failure, which is the
standard drill and is worth automating because doing it by hand means stopping to change
a number every thirty seconds. Hands separate reads the hand field on the note rather
than the part table, so it works on any score, and the hand not being played can be
silent or can play as accompaniment. The three compose: left hand only, bars 17 to 20,
starting at half tempo and climbing. That sentence is exactly what somebody will ask
Claude Code for, so the practice engine has to accept it as one request.

### §PI42 Remembering what still fails

Without history every session starts from zero and the app cannot answer the only
question a learner really has, which is what to work on today. Progress is stored per
score and per section: attempts, accuracy per bar, the tempo reached, the level
practised at and when. It stays local, as the non-goals require, in a store that can be
exported and deleted, because practice history is personal data even when it never
leaves the machine. The useful output is not a chart but a suggestion: these four bars
failed more than the rest, start there. Progress is keyed on section id and score id
rather than on a file path or a title, so a score that is re-saved or relabelled does
not lose its history. A score corrected after somebody fixes a wrong note keeps its
history too, flagged with the fact that the source changed, since silently discarding
weeks of records is worse than showing a comparison that is slightly stale.

## Block F — Claude Code First: MCP and plugin

### §PI43 The tools Claude Code actually needs

The premise is that somebody types a sentence into Claude Code and a piano plays, so the
tool surface has to be the shape of that sentence rather than the shape of the code
beneath it. The set is small and deliberate. Score tools: validate a score and return
errors a model can act on, save one into the library with its metadata, read one back.
Transport tools: play, stop, seek to a bar or a named section, set tempo scale, set
transpose, set difficulty level, report current state. Library tools: list what is there
and search it. What is not exposed matters as much: nothing that writes an arbitrary
file, nothing that runs a command. The server is a separate package depending on the
shared format package, so validation inside a tool call and validation inside the app
are the same code and cannot disagree. Every tool description is written for a model
reading it cold, because a description that needs the source to understand is a tool
that gets called wrongly.

### §PI44 Finding the window the user is looking at

The MCP server is started by Claude Code and the app is started by the user, so they are
two processes that have never met. Getting this wrong produces the worst possible
failure: the tool call succeeds, something plays somewhere, and the window in front of
the user sits silent. So the app writes a small file on start, in a known per-user
location, holding the endpoint it listens on, a token and its process id, and removes it
on exit. The server reads that file, checks the process is alive and connects. A stale
file left by a crash is caught by the liveness check rather than trusted. Where several
windows are open the most recently focused one wins, because that is the one the person
is looking at. The channel itself is a local socket or a loopback endpoint, chosen for
what is reliable on Windows as well as macOS, and the handshake carries a protocol
version so an old plugin meeting a new app fails with a clear message instead of odd
behaviour.

### §PI45 A plugin, not a configuration exercise

If installing this means editing a JSON file by hand and already knowing what an MCP
server is, the Claude Code First premise is true only for the person who built it. So
the whole thing ships as a plugin: the MCP server declaration, the score-authoring skill
and a few commands named after what people actually want. The commands are worth more
than they look, because they are where a vague request becomes a specific one: create a
score for a named piece, play what is open, practise a passage, set the level. Each
command is a short prompt that reaches for the skill and then the tools, so the model is
not rediscovering the workflow on every request. The plugin has to behave sensibly when
the app is not installed yet, which means the failure says how to install it rather than
reporting a connection error. Versioning the plugin against the app protocol belongs
here too, since the two will be updated at different times by different people.

### §PI46 Teaching the model to write a score that is right

A model asked for a piece will produce something that parses and is musically wrong in
predictable ways, and preventing that is what this skill is for. It states the format
concretely, with one small complete example rather than a field list, because an example
is what actually gets followed. It states the musical conventions: middle C is MIDI 60,
ticks run 480 to the quarter, a bar of four four is 1920 ticks, and velocity should
range like dynamics instead of sitting at a flat 100 throughout. And it states the
mistakes no schema catches: overlapping notes inside one voice, a left hand written
above the right, chords spanning more than a hand reaches, a melody that never leaves
one octave, and a beginner arrangement identical to the advanced one. It also says when
to stop, because a request for a copyrighted song deserves an honest answer rather than
a fabricated approximation presented as the real thing.

### §PI47 Errors written for the thing that will read them

The main reader of a validation error here is not a person, it is a model about to try
again, and that changes what a good error is. Each one carries the JSON path to the
field, the value that arrived, what was expected, and where possible the specific
correction. Overlapping notes name both note ids and the tick where they collide. A tick
off the grid says what the nearest valid value would be. A missing required field names
it and gives a valid example. Errors come back as structured data alongside the prose,
so a retry can be driven programmatically rather than by rereading English. Just as
importantly they are bounded: a score with two hundred problems returns the first
handful grouped by kind instead of two hundred lines, because a wall of output is a
repair loop that never converges. The same errors surface in the app when a user opens a
bad file, showing the prose half and keeping the JSON paths out of the way.

### §PI48 Making it work from a cold start

The ordinary case is somebody sitting in a chat window with the app not running, and if
the answer is open the app first then this is a demo rather than a product. So a
transport tool that finds no app can start one, wait for the handshake and carry on, and
a tool call arriving while the app is running brings that window to the front so the
person sees what they asked for. Both behaviours are explicit and bounded: launching has
a timeout and a clear failure, and it never starts a second instance when one is already
there. This is also where the app has to be findable as an installed application rather
than a development checkout, which ties straight back to packaging. Focus stealing stays
conservative on purpose: raising a window because the user just asked for music is
right, doing it for a background library query is not, so only tools that produce sound
or a visible change raise it.

### §PI49 A convenience channel that is not a way in

A local endpoint that accepts a score and plays it is, described plainly, a way to make
a program on this machine do something. That is fine and it needs bounds. The listener
binds to loopback only and never to an external interface. Every request carries the
token from the handshake file, generated per app start and readable only by the current
user, so another account on a shared machine cannot drive it. Payloads are validated by
the same schema as everything else before reaching any code that acts on them. File
paths crossing the boundary are confined to the library directory rather than accepting
an arbitrary path, because a tool that saves a score anywhere is a tool that overwrites
anything. Nothing on this channel runs a command or evaluates code. None of this is
exotic; it is the difference between a feature and an incident, and it costs far less
now than as a retrofit after the plugin is published.

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
a malformed file produces the same readable error however it arrived. A file that fails
to open must not leave the app half-loaded with the previous score partly replaced,
which is the bug this feature is most likely to grow. A .mid file takes the same routes
through importMidi from the score-format package, and the lists of what it dropped and
what it guessed are shown to whoever opened it rather than swallowed.

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
the metronome and count-in preferences. They live in one store in the per-user
application directory, validated on read the same way the score format is, so a
corrupted or hand-edited file falls back to defaults with a message rather than crashing
at startup. Settings are versioned and migrated for the same reason scores are, because
a setting whose meaning changes silently is worse than one that is missing. Anything
sensitive, which here is essentially the handshake token, stays out of this file and is
regenerated per run instead. A reset to defaults is offered, because the fastest way out
of a bad audio configuration is to start over, and the alternative is somebody deleting
a file they first had to find.

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
