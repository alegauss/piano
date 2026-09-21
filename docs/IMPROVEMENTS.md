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

## Block B — Score JSON format

## Block C — Audio engine and transport

## Block E — Practice mode and difficulty levels

## Block F — Claude Code First: MCP and plugin

## Block G — Score library and distribution

## Block H — Sheet music view

### §PI73 A stave on screen, drawn by VexFlow

VexFlow is the dependency, because engraving is a large, solved, unglamorous problem:
glyphs, stems, beams, accidental placement and horizontal spacing are weeks of work
nobody will thank us for. It renders in the browser with no node imports, so it sits
inside the renderer sandbox, and the adapter written against it stays small.

SheetMusic.tsx is a read-only panel in the main row, carrying an aria-label the way
PartsPanel does, so a browser test can find it by accessible name. It takes the notes
already filtered through visibleNotes(notes, view), so hiding a part in PartsPanel hides
it here too without a second filter.

The adapter maps hand to clef — right to treble, left to bass — spelling to the written
accidental, metadata.key to the key signature, and timing.timeSignatures to the meter,
one VexFlow stave per bar per clef, laid out in systems that wrap to the panel width.
PI72 supplies the figures and the rests.

Scope this to a static engraving of the open piece. No control reaching it, no highlight
while it plays, no theming: each of those is a different kind of work and gets its own
line after this one. The test is a browser test, rendering a two-bar score and asserting
the staves, the clefs and the note count, because jsdom would pass against a stylesheet
that never loaded. It stops short of the non-goal "Staff notation editor": this view
reads a score and never edits one, so no rivalry with MuseScore starts here.

### §PI74 The button, and where the choice is kept

There is no tab system here, and this should not be the task that introduces one. The
only view state today is full: a useState in App.tsx, toggled from TransportBar, left
with Escape. Follow that shape.

A button in TransportBar, beside the ones that open the level and drill panels, swaps
the centre of the main row between PianoRoll and SheetMusic. It carries a pressed state
and an accessible name, so a browser test can click it by name and assert which panel is
mounted. PartsPanel stays where it is through the swap; only the pane to its right
changes.

The two are alternatives rather than neighbours. Side by side at this window width, each
would be squeezed to illegibility, and the reader wants one or the other anyway: the
roll to see what is coming, the stave to read what is written.

Keep the choice in appSettings, the way the level and the sound are kept, so reopening a
piece reopens it in the view the player last read it in. That is one key in the settings
schema and whatever migration the store expects. Give it a shortcut in the KeysPanel
table if a free key is left, but do not invent a chord for it.

Tests: a browser test that toggles and asserts the swap, and a settings test that the
key round-trips. It does not cross "Transcribing MP3, YouTube or PDF sheet music into
JSON": this shows a score the app already holds.

### §PI75 Following the playhead without re-engraving

Take the position the way PianoRoll takes it: a position callback prop read inside
requestAnimationFrame, never a state update at sixty hertz. App.tsx already passes the
position, the tempo scale and the grader feedback that way, and a sheet view that
renders per frame would be the first thing in this app to do so.

Re-engraving per frame is out of the question, so VexFlow draws once per layout and the
highlight sits over it: a band on the sounding bar and a colour swap on the note heads
soundingPitches reports, addressed through ids the adapter kept when it built each bar.
Laying out again belongs to a resize or a new piece, not to playback.

Turning the page follows the same reading. When the sounding bar leaves the visible
systems, scroll to the system holding it — a jump per system rather than a smooth crawl,
because that is how a reader's eye moves down a page.

The grader and wait mode already colour notes in the roll through noteLook. Reuse those
verdicts here, so a wrong note looks wrong in whichever view is open.

A browser test seeks the transport to a known tick and asserts which bar carries the
highlight; a second asserts that playing for a second causes no React render.

### §PI76 Ink for a theme that is not paper

check-colour-tokens.mjs refuses any colour literal and any palette class under
src/renderer outside styles/tokens.css, and the canvas code already reads its colours
through useCanvasPalette and CANVAS_TOKENS. The stave has to join that system rather
than sit beside it.

So declare tokens for what the engraving draws — stave lines, note heads and stems, bar
lines, the highlight band — in tokens.css for both themes, and hand them to VexFlow as
explicit styles as the adapter builds each element. Nothing in SheetMusic.tsx should
name a colour.

Reading matters more than fidelity here. Engraving convention wants black on paper and a
dark theme cannot have it, so invert the relationship instead of the colours: stave
lines a step dimmer than the note heads, the way the roll's grid sits under its notes,
so the notes stay the thing the eye lands on.

The music font VexFlow ships must come from the bundle, not from a CDN: the renderer is
sandboxed and the app has to work offline. Check what the Vite build emits and that a
packaged build draws glyphs rather than fallback boxes.

The test is a browser test asserting the computed colour of a stave line and a note head
in both themes against the token values, since jsdom cannot see a stylesheet and would
pass on anything.

### §PI77 Saying which part of the page is a guess

Engraving reads as fact, which is the problem: a stave drawn from inference looks
exactly like a stave drawn from a manuscript.

What is actually inferred is worth listing. There are no clefs in the format, so the
view reads hand, which note.ts warns is not the same thing as part. There is no key
signature over time, only metadata.key as a free-form string; MIDI import keeps the
first one it finds and drops any change mid-piece. There are no ties, no beams and no
rests: a tied note is one long duration, and a gap is either a rest somebody wrote or a
beat somebody forgot. barFigures reads one line per hand, so a held inner voice loses
its figure, and a triplet's leftover is tied or rounded: name both.

MIDI export already answers this shape of problem honestly. The score:export response
carries a dropped list of what the file could not hold, and describeExport turns it into
a sentence. Do the same here, shown the way OpenReport shows what an import guessed.

Say it once for the piece rather than once per bar, and name the reading rather than the
field: which clef came from which hand, that accidentals came from spelling where it was
written and from the sharps-upward fallback where it was not, and that a bar which does
not add up was filled with rests.

A test asserts the sentence for a score with no key, mixed hands and a short bar.
