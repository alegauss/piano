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

### §PI76 Ink for a theme that is not paper

check-colour-tokens.mjs refuses any colour literal and any palette class under
src/renderer outside styles/tokens.css, and the canvas code already reads its colours
through useCanvasPalette and CANVAS_TOKENS. The stave has to join that system rather
than sit beside it.

So declare tokens for what the engraving draws — stave lines, note heads and stems, bar
lines, the highlight band — in tokens.css for both themes, and hand them to VexFlow as
explicit styles as the adapter builds each element. Nothing in SheetMusic.tsx should
name a colour. PI75 paints a sounding note by setting fill on its glyph and restores it
with removeAttribute, so an engraving styled by attribute needs a restore that puts the
token back.

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

### §PI78 Loading the engraver when somebody asks for it

Measured across PI73 and PI74: the renderer bundle was 595 kB before the sheet view and
is 1,728 kB after it. VexFlow carries Bravura, and a music font is most of that. Nothing
was done wrong; the whole of it simply arrives in the first chunk.

This is about start-up rather than download. The app is installed from disk and ships a
sample bank of several hundred megabytes, so a megabyte on disk is nothing. What it
costs is parse and compile on every launch, paid by everyone, including a player who
only ever watches the roll.

The seam is already in the right place. SheetMusic.tsx is the only importer of
sheet-draw.ts, which is the only importer of vexflow, so a lazy import of the component
alone moves the library out of the first chunk: React.lazy with a Suspense fallback
around the branch in App.tsx that chooses between PianoRoll and SheetMusic. The fallback
is a line of text in the panel, not a spinner.

Confirm it rather than assume it: the build prints the chunk sizes, so the claim is that
the entry chunk drops by about a megabyte and a second chunk appears. A test asserting a
byte count would be a test about esbuild, so do not write one.

Watch two existing tests. SheetMusic.browser.test.tsx mounts the component directly and
is unaffected. App.browser.test.tsx presses the button and expects the panel at once, so
it needs to await the lazy load; findByLabelText rather than queryByLabelText is the
change.
