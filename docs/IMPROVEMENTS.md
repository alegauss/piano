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

### §PI18 A seam between making sound and deciding what to sound

Everything above the audio layer, the transport, the roll, the practice grader and the
MCP tools, cares about notes and time rather than oscillators and buffers. So the engine
is defined by a narrow interface: prepare a score, note on with pitch, velocity and a
scheduled time, note off, pedal, set master gain, stop everything. Nothing above that
seam may touch a Web Audio node directly. Two implementations sit behind it from the
start. A synthesised engine built on simple oscillators is small, always available, and
is what the tests run against and what plays while samples are still downloading. The
sampled engine is the real product. Having both on day one is not over-engineering, it
is what makes the audio layer testable at all, because a test needing real samples and a
real output device is a test nobody runs. The interface takes absolute times in the
audio clock units rather than delays, since that is the only thing the scheduler can
hand it without reintroducing drift, and it is the decision that would be expensive to
reverse later.

### §PI19 A look-ahead scheduler, not a timer per note

Timers in a renderer process are not accurate enough for music. A setTimeout can be tens
of milliseconds late under layout work or garbage collection, and a chord whose notes
land twenty milliseconds apart sounds broken rather than merely late. The standard
answer applies: a periodic wake-up roughly every 25 milliseconds looks about 100
milliseconds ahead in the score and schedules every note falling inside that window at
an exact time on the Web Audio clock, which runs on the audio thread and does not care
what the interface is doing. The scheduler owns the single conversion from ticks to
seconds, reading the tempo map, so tempo changes and practice slow-down are handled in
one place rather than three. It is written against an injectable clock, which is what
makes it testable without playing anything: a test advances synthetic time and asserts
exactly which notes were scheduled at which offsets. The renderer reads that same clock
instead of counting frames, and that is what keeps the falling notes and the sound in
agreement.

### §PI20 Turning a sample library into a shippable pack

The Salamander Grand is the usual starting point: a well recorded piano under a
permissive licence, distributed as hundreds of megabytes of uncompressed WAV across many
velocity layers. It cannot ship in that form. The pipeline is a script, checked into the
repository and runnable from scratch, that fetches the source, verifies a checksum,
trims silence, normalises consistently, encodes to a compressed format and emits a
manifest saying which file covers which pitch and which velocity range. Pitches that
were never sampled are filled by shifting a neighbour at load time, so the pack stays
small without leaving holes. The manifest is what the engine reads; no filename is ever
constructed by convention. The licence text travels inside the pack and is surfaced in
the app, because shipping somebody else's recordings without attribution is exactly the
kind of thing this project has already said it will not do. Users never run the script:
it produces a versioned artifact that both the build and the first-run downloader point
at.

### §PI21 First note now, full piano shortly

A piano pack is large enough that waiting for it makes the app feel broken, and the
moment that matters most is the first one: somebody opens a score and presses play. So
loading is staged. The synthesised engine is ready instantly and takes the first notes.
The sampled pack loads by register, starting with the two octaves around middle C where
most material lives, and the engine switches voice by voice as real samples arrive
rather than waiting for the whole pack to land. A memory budget caps how much stays
decoded at once, evicting least recently used registers, because decoded audio is far
larger than the compressed file and an app that grows without limit will be blamed on
the piano. Progress is visible but never modal: the user can play while it loads. The
switch between the two engines has to be inaudible in the ordinary case, which means
matching gain and attack across them, and that is worth testing deliberately rather than
discovering by ear during a lesson.

### §PI22 Velocity layers, release and a sustain model

A sampled piano only convinces when the mapping is right. Velocity chooses a layer
rather than only a gain: a note struck softly is a different recording, not the same one
played quieter, and crossfading between adjacent layers avoids an audible step at the
boundary. Release samples matter more than people expect, because the sound of a key
being let go is most of what makes a passage sound played rather than sequenced. Sustain
is modelled rather than faked: pedal down stops the damper cutting the note, notes
struck while the pedal is down keep ringing past their written end, and pedal up
releases everything currently held, all driven by the control events the format already
carries. Half pedal maps to partial damping rather than a switch, since the format
stores a value and discarding it would waste the one place that nuance was written down.
Each of these is verifiable by measuring rendered output offline, which is how they get
tested at all without a human sitting and listening.

### §PI23 One clock, one transport state machine

The transport is small and it is the thing everything else reads. It owns a state
machine of stopped, playing and paused, a position in ticks, and the operations play,
pause, stop, seek to tick, set loop range, set tempo scale and set transpose. Two rules
make it work. There is exactly one clock, the audio clock, and the interface derives its
position from that rather than keeping a second counter, because anything counting
frames independently drifts away from the sound inside a minute. And every operation is
defined in ticks, so seeking to a bar, looping a named section and slowing to 60 percent
compose without special cases between them. Tempo scale multiplies the tempo map rather
than editing it, keeping the displayed BPM and the written score separable. Transpose
shifts pitch at the engine boundary, which keeps the score and the roll honest about
what is actually written. Seeking while the pedal is held has to restore pedal state,
and that edge case is worth writing down before it is discovered.

### §PI24 A beat to play against, and a bar before it starts

Two small features the practice mode is unusable without. The metronome is scheduled by
the same look-ahead scheduler as the notes, reading the time signature map so the
downbeat is accented and an odd meter is counted correctly, and it sits on its own gain
so it can stay audible against a loud passage. The count-in gives a full bar of clicks
before playback starts, at the practice tempo rather than the written one, which is what
lets a player arrive on the first note instead of chasing it. Both are off by default
when listening and on by default when practising, because the same feature is helpful in
one mode and irritating in the other. The count-in also matters to the grader: without
it the first note of every attempt is scored late through no fault of the player, and a
scoring system that punishes a fair attempt is one people quickly stop trusting.

## Block D — Piano roll and on-screen keyboard

### §PI25 88 keys with the geometry a pianist expects

The keyboard is not decoration, it is the coordinate system. Every falling note has to
land exactly on its key, so the geometry must be the real one rather than an even grid:
white keys of equal width, black keys at the correct offsets inside an octave, narrower
and shorter, with C sharp and D sharp spaced differently from F sharp, G sharp and A
sharp. Getting that wrong is immediately visible to anyone who plays. The component
renders 88 keys from A0 to C8 and exposes, for any MIDI pitch, the horizontal position
and width of its key, which is the function the roll calls for every note it draws. It
also renders a state per key: idle, sounding, expected by the practice mode, pressed
correctly, pressed wrongly. Those states are visual only and driven from outside, so one
component serves listening and practice without knowing which mode it is in. It stays
readable from a narrow window up to a full-screen display, which means key width is
derived from available space rather than fixed.

### §PI26 Falling notes anchored to the audio clock

This is the view in the reference image: notes descending a dark field and striking a
keyboard along the bottom. The geometry is simple and the timing is not. Vertical
position is a function of a note tick and the current playback position, so the renderer
needs a position it can trust on every frame. It reads the audio clock instead of
accumulating frame deltas, because the second approach drifts, and a roll forty
milliseconds ahead of the sound feels wrong long before anyone can say why. Each frame
asks the transport for the current tick, converts the visible time window into a tick
range, and draws every note inside it at a height derived from how far in the future it
is. The lead time, meaning how many seconds of music are visible at once, is a setting:
a beginner wants more warning, and the right value changes with tempo. Notes come from
the resolved arrangement, so difficulty level and muted parts are already applied and
the renderer never reasons about either.

### §PI27 Sixty frames a second when the music is dense

The worst moment for the renderer is the best moment in the music: a dense passage with
the pedal down, dozens of notes visible and particles firing. It has to hold 60fps
there, because a stutter at that exact moment is the one people remember. The approach
is a canvas rather than DOM elements, since hundreds of absolutely positioned divs is
the wrong shape for this problem. Notes are held in an array sorted by tick, so the
visible range is found by binary search instead of scanning the whole score every frame,
and only that window is drawn. Static layers, the keyboard and the bar lines, are
rendered once to an offscreen canvas and blitted rather than redrawn. Everything else is
measured: a development overlay reports frame time, and a performance test plays a
deliberately dense fixture and fails when the ninety-fifth percentile frame exceeds
budget. If canvas 2D cannot hold the target on a modest machine a WebGL path is the
fallback, but it is not the starting point, because the simpler thing is probably enough
and far easier to get right.

### §PI28 The moment of contact

In the reference image a note reaching the keyboard throws a burst of bright particles
and the key lights up. It looks like polish and it is really feedback: it marks the
instant of the strike, which is the one thing the eye should catch, and it is what makes
the roll read as impact rather than as a list scrolling past. The effect fires from the
same scheduler-derived event as the sound, so light and sound coincide; deriving it from
the drawing loop would put it a frame or two off, which is exactly the error the whole
clock design exists to avoid. Intensity follows velocity, so a loud chord looks loud.
Particles live in a fixed-size pool that is never allowed to grow, because an effect
allocating during a dense passage is an effect that causes the stutter it was meant to
celebrate. The Effects toggle in the reference bar turns it off for a slower machine or
for someone who finds it distracting, and off has to cost nothing rather than drawing
invisible particles.

### §PI29 Bar lines, numbers and somewhere to point

Without bar lines the roll is a stream with no structure and nothing to count. Bar lines
come from the time signature map rather than a fixed division, so a piece that changes
meter draws correctly and a pickup bar is not mislabelled as bar one. Bar numbers sit at
the left edge, as in the reference image, and they are the vocabulary everything else
uses: the loop selector, the practice tools and the MCP transport commands all speak in
bars. Beat subdivisions are drawn more faintly than bar lines, because that hierarchy is
what makes the field readable at a glance instead of a grid of equal lines. The current
bar is highlighted, which is the cheapest possible answer to where am I. And bars are
selectable directly on the roll by dragging across a range to set a loop, because the
alternative is typing numbers into a field, and nobody practising wants to do that
between attempts.

### §PI30 The bar the whole app is driven from

The reference image puts the entire control surface on one row, and that density is
right: restart, pause, loop, elapsed and total time, an effects toggle, transpose, a BPM
stepper, a theme switch, zoom and full screen, with a scrubber over the whole piece just
below. Two things make this more than assembling buttons. The first is that every
control has to be honest about a transport that is an independent state machine:
pressing pause must reflect what actually happened rather than optimistically flipping
an icon, and scrubbing has to seek without the position snapping back when the next
clock reading arrives. The second is keyboard shortcuts, because a learner has their
hands on a piano and not on a mouse: space to start and stop, and single keys for
slower, faster, loop and restart. The bar collapses gracefully in a narrow window, and
full screen hides everything except the roll and the keyboard, which is the mode someone
actually plays in.

### §PI31 Taking the recording apart

The PARTS panel down the left edge of the reference image is how a listener stops being
only a listener. Each part gets a row carrying its name, a colour swatch, and mute, solo
and hide. Mute and hide are separate on purpose: following the left hand visually while
hearing both is a real way to practise, and so is hearing one hand while watching both.
Solo is exclusive by convention and additive with a modifier, as in every audio tool
anyone has used. The panel also offers hands and not only parts, since hand is a
property of the note rather than of the part, and left hand only is the thing a learner
asks for most often. Changes take effect at the next scheduled note rather than cutting
what is already sounding, which avoids a click in the middle of a chord. The state
belongs to the session and never to the file, because muting a part is a way of
listening and not an edit to somebody's score.

### §PI32 One palette, two themes, readable by everyone

The roll is drawn on a canvas and the rest of the interface is DOM, and the failure mode
is that the two halves end up coloured by different people at different times. So there
is one palette defined as tokens, and the canvas reads them from computed style rather
than carrying its own constants. Both themes are real: the reference is dark and dark is
the default, but light has to be genuinely readable rather than an inverted
afterthought, which mostly means note fills and bar lines need different contrast rather
than different hue. Parts are distinguished by hue plus a second channel, brightness or
a marking on the note cap, so two parts stay tellable apart for a red-green colour-blind
viewer, since hue alone fails roughly one man in twelve. Contrast between a note and the
background, and between an expected note and a wrong one in practice mode, is checked
against a measured ratio rather than eyeballed, because the practice colours are the
ones carrying meaning.

## Block E — Practice mode and difficulty levels

### §PI33 A real piano as the input device

The practice mode only earns its name once it is connected to a real keyboard, so Web
MIDI comes first here. In Electron the API exists in the renderer but needs its
permission handler wired up in main, which is easy to miss and fails silently rather
than raising an error. Devices are enumerated, shown by name and remembered between
sessions, since somebody with one controller should never have to pick it twice.
Hot-plug matters more than it sounds: switching a USB keyboard on after the app is
already running is a normal thing to do, and the connection event has to reconnect
rather than demand a restart. Incoming messages are normalised at the boundary into the
same note-on, note-off and control-change shape the rest of the app speaks, with running
status handled and velocity zero treated as note off, because controllers differ and
nothing downstream should have to know that. Pedal arrives on controller 64 by the same
path. A monitor view showing raw events is worth building here, since it is the only way
to diagnose an odd controller without guessing.

### §PI34 Playable on a laptop, testable without hardware

Most people will open this app on a machine with no MIDI keyboard attached, and if the
answer is buy a controller first then nobody tries it. So the computer keyboard is a
real input: two rows mapped as roughly an octave and a half, in the layout trackers and
sequencers have used for decades, with keys to shift octave and a visible indication of
where the mapping currently sits. The limitations are stated rather than hidden. There
is no velocity, so a fixed value is used and dynamics are simply not graded on this
input. Key rollover on a typical keyboard means some chords cannot be played at all,
which belongs in the interface rather than leaving someone to conclude their playing is
wrong. Auto-repeat has to be suppressed or a held key becomes a stream of note-ons.
Beyond reach, this path is what makes the whole practice block testable: a test can
synthesise key events deterministically, where testing MIDI input needs hardware nobody
has in CI.

### §PI35 Measuring the lag before grading anyone

Every machine has latency, and on a bad setup it is enough to make a player who is
perfectly in time look consistently late. Two delays matter and they are not the same.
Output latency is how long after scheduling a note it is actually heard, and Web Audio
reports an estimate that is usually close enough to use. Input latency is how long after
a key is struck the event arrives, and nothing reports that, so it is measured: the app
plays a click and asks the player to strike along with it a dozen times, takes the
median offset and stores it as a per-device calibration. Median rather than mean,
because a player will mistime one or two and an average drags. The measured value is
subtracted before any timing judgement and is shown to the user rather than hidden,
since an absurd figure usually means a bad audio driver and the honest response is to
say so out loud. Calibration is per device and per output, because a Bluetooth headset
and a controller each change it.

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
apart from note accuracy, since they are different skills.

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
reinstall, and the app tolerates holding an older pack than it would prefer. For an
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
